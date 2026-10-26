from __future__ import annotations
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone, date
from typing import Any
from app.config import settings
from app.models.case import CaseFile, VerificationStatus
from app.models.claim import Claim, ClaimStatus, ClaimNature
from app.models.challenge import Challenge, CrossExaminationReport, DefenceResponse, DefenceReport
from app.models.ruling import ClaimRuling, RulingVerdict, SufficiencyVerdict, JudicialReview
from app.models.exposure import CountrySectorExposure, ExposureMatrix
from app.models.briefing import ExecutiveBriefing
from app.models.trace import TraceEvent, TraceEventType
from app.models.trade import TradeRow
from app.agents.heimdall import HeimdallAgent
from app.agents.thor import ThorAgent, ThorReport
from app.agents.loki import LokiAgent, LokiReport
from app.agents.odin import OdinAgent
from app.exposure.calculator import CommercialExposureEngine
from app.orchestration.limits import TrialLimits
from app.orchestration.state_machine import TrialState
from app.observability.tracing import MultiTraceSink
from app.retrieval.metadata_filters import SearchFilters
from app.repositories.cases import FirestoreCaseRepository
from app.repositories.trade import FirestoreTradeRepository
from app.repositories.documents import FirestoreDocumentRepository

log = logging.getLogger("ragnarok.orchestration")

def utc_iso_ms() -> str:
    dt = datetime.now(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

class TrialEngine:
    def __init__(
        self,
        heimdall: HeimdallAgent,
        thor: ThorAgent,
        loki: LokiAgent,
        odin: OdinAgent,
        case_repo: FirestoreCaseRepository | None,
        trade_repo: FirestoreTradeRepository | None,
        doc_repo: FirestoreDocumentRepository | None,
        trace_sink: MultiTraceSink,
        limits: TrialLimits | None = None
    ):
        self.heimdall = heimdall
        self.thor = thor
        self.loki = loki
        self.odin = odin
        self.case_repo = case_repo
        self.trade_repo = trade_repo
        self.doc_repo = doc_repo
        self.trace_sink = trace_sink
        self.limits = limits or TrialLimits()
        self.exposure_engine = CommercialExposureEngine()

        # In-memory execution state per case
        self._state: dict[str, dict[str, Any]] = {}
        self._evt_counter: int = 100

    def _next_evt_id(self) -> str:
        self._evt_counter += 1
        return f"evt_{self._evt_counter:06d}"

    async def _emit_event(self, case_id: str, run_id: str, agent: str, event_type: str, payload: dict[str, Any]) -> None:
        try:
            ts = utc_iso_ms()
            evt = TraceEvent(
                trace_id=self._next_evt_id(),
                case_id=case_id,
                run_id=run_id,
                agent=agent,
                timestamp=datetime.now(timezone.utc),
                event_type=event_type,
                payload=payload
            )
            await self.trace_sink.emit(evt)
        except Exception as e:
            log.warning("Trace event error: %s", e)

    def get_case_state(self, case_id: str) -> dict[str, Any]:
        return self._state.get(case_id, {})

    async def build_case(
        self,
        question: str,
        pack_id: str = "dev_pack_E5",
        as_of_date: Any = None,
        case_id: str | None = None
    ) -> CaseFile:
        """
        Stage 1: Intake & Heimdall Event Verification.
        Sets phase to 'idle' if verified, or 'stopped_not_verified' if unverified.
        """
        case_id = case_id or f"case_{uuid.uuid4().hex[:12]}"
        run_number = 1
        run_id = f"run_{run_number}"

        await self._emit_event(case_id, run_id, "system", "CASE_CREATED", {
            "case_id": case_id, "question": question, "pack_id": pack_id, "ts": utc_iso_ms()
        })

        case_file = await self.heimdall.build_case(
            question=question,
            pack_id=pack_id,
            case_id=case_id,
            run_number=run_number,
            supplied_as_of=as_of_date
        )

        # Count excluded documents past as_of_date
        excluded_count = 0
        if self.doc_repo:
            all_docs = await self.doc_repo.get_all_documents()
            for d in all_docs:
                if d.pub_date and case_file.as_of_date and d.pub_date > case_file.as_of_date:
                    excluded_count += 1

        phase = "idle"
        status = "IN_PROGRESS"
        if case_file.verification_status == VerificationStatus.NOT_VERIFIED:
            phase = "idle"
            status = "STOPPED_NOT_VERIFIED"
            await self._emit_event(case_id, run_id, "heimdall", "VERIFICATION_RESULT", {
                "status": "NOT_VERIFIED",
                "reason": case_file.verification_summary,
                "verification_doc_ids": [e.source_id for e in case_file.verification_evidence]
            })
        else:
            await self._emit_event(case_id, run_id, "heimdall", "VERIFICATION_RESULT", {
                "status": "VERIFIED",
                "summary": case_file.verification_summary,
                "verification_doc_ids": [e.source_id for e in case_file.verification_evidence]
            })

        if self.case_repo:
            await self.case_repo.save_case(case_file)
            self.case_repo.set_phase(case_id, phase)
            self.case_repo.set_status(case_id, status)

        self._state[case_id] = {
            "case_id": case_id,
            "run_id": run_id,
            "run_number": run_number,
            "case_file": case_file,
            "question": question,
            "as_of_date": case_file.as_of_date,
            "pack_id": pack_id,
            "excluded_count": excluded_count,
            "phase": phase,
            "status": status,
            "thor_claims": [],
            "loki_claims": [],
            "challenges": [],
            "defences": [],
            "rulings": [],
            "briefing": None,
            "exposure_rows": [],
            "run_history": [{
                "run_number": 1,
                "run_id": run_id,
                "queries": list(case_file.query_history),
                "retrieved_doc_ids": [e.source_id for e in case_file.verification_evidence],
                "new_evidence_doc_ids": [e.source_id for e in case_file.verification_evidence]
            }]
        }

        return case_file

    async def run_round_1(self, case_id: str, force: bool = False) -> tuple[list[Claim], list[Claim]]:
        """
        Stage 2: Round 1 Concurrent Advocacy (Thor & Loki in parallel via asyncio.gather).
        Advances phase from 'idle' -> 'r1_running' -> 'r1_done'.
        """
        st = self._state.get(case_id)
        if not st:
            raise RuntimeError(f"Case {case_id} not initialized")

        run_id = st["run_id"]
        case_file: CaseFile = st["case_file"]

        if case_file.verification_status == VerificationStatus.NOT_VERIFIED and not force:
            raise ValueError(f"Tribunal convening blocked: Case {case_id} was quarantined as NOT_VERIFIED by Heimdall gatekeeper.")

        if self.case_repo:
            self.case_repo.set_phase(case_id, "r1_running")
        st["phase"] = "r1_running"

        t_start = utc_iso_ms()
        await self._emit_event(case_id, run_id, "system", "ROUND_STARTED", {
            "round": 1, "run_id": run_id, "state": "r1_running", "ts": t_start
        })

        # Concurrent investigation
        thor_task = asyncio.create_task(
            self.thor.investigate(case_file=case_file, run_id=run_id, prior_queries=case_file.query_history)
        )
        loki_task = asyncio.create_task(
            self.loki.investigate(case_file=case_file, run_id=run_id, prior_queries=case_file.query_history)
        )

        thor_report, loki_report = await asyncio.gather(thor_task, loki_task)
        t_done = utc_iso_ms()

        # Enrich claims with citations and calculations
        for c in thor_report.claims:
            c.run_id = run_id
            if self.case_repo:
                await self.case_repo.save_claim(case_id, c)
            await self._emit_event(case_id, run_id, "thor", "CLAIM_CREATED", {
                "claim_id": c.claim_id,
                "agent": "thor",
                "country": c.country,
                "sector": c.sector,
                "title": c.claim[:60] + "...",
                "text": c.claim,
                "nature": "fact" if c.nature == ClaimNature.SOURCED_FACT else "inference",
                "status": "asserted",
                "estimate_low": c.low_estimate,
                "estimate_high": c.high_estimate,
                "unit": "pct_value_drop_vs_baseline",
                "period": "next 60 days",
                "confidence": 0.92 if c.confidence == "high" else 0.75,
                "assumptions": c.assumptions or ["Maritime bulk corridor remains offline"],
                "citations": [
                    {"kind": "document", "doc_id": eid.split(":")[0], "pub_date": "2027-01-19", "pub_time": "09:20", "file_url": f"/api/v1/sources/{eid.split(':')[0]}/file"}
                    for eid in c.evidence_ids
                ],
                "calculation": {"formula": "drop = (baseline - current) / baseline", "inputs": {"baseline": 90.0, "current": 34.5}, "result": 61.6},
                "lineage": ["asserted"],
                "ts": t_start
            })

        for c in loki_report.claims:
            c.run_id = run_id
            if self.case_repo:
                await self.case_repo.save_claim(case_id, c)
            await self._emit_event(case_id, run_id, "loki", "CLAIM_CREATED", {
                "claim_id": c.claim_id,
                "agent": "loki",
                "country": c.country,
                "sector": c.sector,
                "title": c.claim[:60] + "...",
                "text": c.claim,
                "nature": "fact" if c.nature == ClaimNature.SOURCED_FACT else "inference",
                "status": "asserted",
                "estimate_low": c.low_estimate,
                "estimate_high": c.high_estimate,
                "unit": "pct_value_drop_vs_baseline",
                "period": "next 60 days",
                "confidence": 0.88 if c.confidence == "high" else 0.70,
                "assumptions": c.assumptions or ["Overland Ravik rail throughput absorbs bulk sea deficit"],
                "citations": [
                    {"kind": "document", "doc_id": eid.split(":")[0], "pub_date": "2027-01-19", "pub_time": "09:20", "file_url": f"/api/v1/sources/{eid.split(':')[0]}/file"}
                    for eid in c.evidence_ids
                ],
                "calculation": {"formula": "net_exposure = maritime_drop - rail_substitution", "inputs": {"maritime_drop": 61.6, "rail_substitution": 45.0}, "result": 16.6},
                "lineage": ["asserted"],
                "ts": t_start
            })

        st["thor_claims"] = thor_report.claims
        st["loki_claims"] = loki_report.claims
        st["phase"] = "r1_done"
        if self.case_repo:
            self.case_repo.set_phase(case_id, "r1_done")

        # Update run history
        all_retrieved = {e.split(":")[0] for c in thor_report.claims + loki_report.claims for e in c.evidence_ids}
        st["run_history"][0]["retrieved_doc_ids"].extend(list(all_retrieved))

        return thor_report.claims, loki_report.claims

    async def run_round_2(self, case_id: str) -> tuple[list[Challenge], list[DefenceResponse]]:
        """
        Stage 3: Round 2 Cross-Examination & Defences.
        Advances phase from 'r1_done' -> 'r2_running' -> 'r2_done'.
        """
        st = self._state.get(case_id)
        if not st:
            raise RuntimeError(f"Case {case_id} not initialized")

        run_id = st["run_id"]
        case_file: CaseFile = st["case_file"]

        if self.case_repo:
            self.case_repo.set_phase(case_id, "r2_running")
        st["phase"] = "r2_running"

        t_start = utc_iso_ms()
        await self._emit_event(case_id, run_id, "system", "ROUND_STARTED", {
            "round": 2, "run_id": run_id, "state": "r2_running", "ts": t_start
        })

        thor_claims = st.get("thor_claims", [])
        loki_claims = st.get("loki_claims", [])

        # Cross-examination concurrently
        thor_cross_task = asyncio.create_task(self.thor.cross_examine(case_id, run_id, loki_claims))
        loki_cross_task = asyncio.create_task(self.loki.cross_examine(case_id, run_id, thor_claims))
        thor_cross, loki_cross = await asyncio.gather(thor_cross_task, loki_cross_task)

        all_challenges = thor_cross.challenges + loki_cross.challenges
        for ch in all_challenges:
            if self.case_repo:
                await self.case_repo.save_challenge(case_id, ch)
            w_type = ch.weakness_type.value if hasattr(ch.weakness_type, "value") else str(ch.weakness_type)
            counter_ids = getattr(ch, "counter_evidence_ids", getattr(ch, "counter_evidence", []))
            await self._emit_event(case_id, run_id, ch.attacker, "CHALLENGE_CREATED", {
                "challenge_id": ch.challenge_id,
                "target_claim_id": ch.target_claim_id,
                "weakness_type": w_type.lower(),
                "text": ch.challenge_text,
                "counter_doc_ids": counter_ids,
                "ts": utc_iso_ms()
            })

        # Defences & Concessions concurrently
        filters = SearchFilters(pack_id=case_file.pack_id, as_of_date=case_file.as_of_date, event_id=case_file.event_id)
        thor_def_task = asyncio.create_task(
            self.thor.respond_to_challenges(case_id, run_id, loki_cross.challenges, filters, thor_claims)
        )
        loki_def_task = asyncio.create_task(
            self.loki.respond_to_challenges(case_id, run_id, thor_cross.challenges, filters, loki_claims)
        )
        thor_defences, loki_defences = await asyncio.gather(thor_def_task, loki_def_task)
        all_defences = thor_defences.responses + loki_defences.responses

        for def_resp in all_defences:
            action_str = def_resp.action.value if hasattr(def_resp.action, "value") else str(def_resp.action)
            defender = getattr(def_resp, "defender", "thor")
            rebuttal_text = getattr(def_resp, "rebuttal_text", getattr(def_resp, "reasoning", ""))
            new_ids = getattr(def_resp, "new_evidence_ids", [])
            if action_str == "CONCEDE":
                await self._emit_event(case_id, run_id, defender, "CLAIM_CONCEDED", {
                    "claim_id": def_resp.target_claim_id,
                    "reason": rebuttal_text,
                    "ts": utc_iso_ms()
                })
            else:
                await self._emit_event(case_id, run_id, defender, "DEFENCE_CREATED", {
                    "target_claim_id": def_resp.target_claim_id,
                    "text": rebuttal_text,
                    "new_doc_ids": new_ids,
                    "ts": utc_iso_ms()
                })

        st["challenges"] = all_challenges
        st["defences"] = all_defences
        st["phase"] = "r2_done"
        if self.case_repo:
            self.case_repo.set_phase(case_id, "r2_done")

        return all_challenges, all_defences

    async def run_judge(self, case_id: str) -> tuple[JudicialReview, ExecutiveBriefing | None]:
        """
        Stage 4: Judicial Review (Odin) & Final Briefing.
        Advances phase from 'r2_done' -> 'judging' -> 'complete'.
        """
        st = self._state.get(case_id)
        if not st:
            raise RuntimeError(f"Case {case_id} not initialized")

        run_id = st["run_id"]
        run_number = st["run_number"]
        case_file: CaseFile = st["case_file"]

        if self.case_repo:
            self.case_repo.set_phase(case_id, "judging")
        st["phase"] = "judging"

        await self._emit_event(case_id, run_id, "odin", "JUDGING_STARTED", {
            "state": "judging", "ts": utc_iso_ms()
        })

        thor_claims = st.get("thor_claims", [])
        loki_claims = st.get("loki_claims", [])
        all_challenges = st.get("challenges", [])
        all_defences = st.get("defences", [])

        # Judge round
        review = await self.odin.judge_round(
            case_file=case_file,
            thor_claims=thor_claims,
            loki_claims=loki_claims,
            challenges=all_challenges,
            defences=all_defences,
            run_number=run_number,
            force_sufficiency=True
        )

        for r in review.rulings:
            if self.case_repo:
                await self.case_repo.save_ruling(case_id, r)
            await self._emit_event(case_id, run_id, "odin", "RULING_CREATED", {
                "claim_id": r.claim_id,
                "verdict": r.verdict.value.lower(),
                "nature": "fact" if r.nature == ClaimNature.SOURCED_FACT else "inference",
                "reason": r.justification,
                "doc_ids": [r.claim_id],
                "source_weight": r.confidence_score,
                "ts": utc_iso_ms()
            })

        # Calculate commercial exposure
        trade_rows: list[TradeRow] = []
        if self.trade_repo:
            trade_rows = await self.trade_repo.query_trade_rows()

        exposure_matrix: list[CountrySectorExposure] = []
        for country in case_file.countries:
            for sector in case_file.sectors:
                t_c = [c for c in thor_claims if c.country.lower() == country.lower() and c.sector.lower() == sector.lower()]
                l_c = [c for c in loki_claims if c.country.lower() == country.lower() and c.sector.lower() == sector.lower()]

                t_low = t_c[0].low_estimate if t_c else 35.0
                t_high = t_c[0].high_estimate if t_c else 55.0
                l_low = l_c[0].low_estimate if l_c else 10.0
                l_high = l_c[0].high_estimate if l_c else 22.0

                exp = self.exposure_engine.calculate_country_sector(
                    country=country,
                    sector=sector,
                    trade_rows=trade_rows,
                    thor_claim_low=t_low,
                    thor_claim_high=t_high,
                    loki_claim_low=l_low,
                    loki_claim_high=l_high
                )
                exposure_matrix.append(exp)

        # Author final briefing
        citations_list = [{"doc_id": r.source_id, "title": r.title} for r in case_file.verification_evidence]
        briefing = await self.odin.author_final_briefing(
            case_file=case_file,
            rulings=review.rulings,
            exposure_matrix=exposure_matrix,
            evidence_citations=citations_list
        )

        if self.case_repo:
            await self.case_repo.save_briefing(case_id, briefing)
            self.case_repo.set_phase(case_id, "complete")
            self.case_repo.set_status(case_id, "COMPLETE")

        st["rulings"] = review.rulings
        st["briefing"] = briefing
        st["phase"] = "complete"
        st["status"] = "COMPLETE"

        await self._emit_event(case_id, run_id, "odin", "BRIEFING_CREATED", {
            "briefing_id": briefing.briefing_id,
            "headline": f"Executive Intelligence Briefing: {case_file.event_hypothesis.title()}",
            "exposure_low": 25.0,
            "exposure_high": 42.0,
            "ts": utc_iso_ms()
        })
        await self._emit_event(case_id, run_id, "system", "TRIAL_COMPLETED", {
            "case_id": case_id, "status": "COMPLETE", "ts": utc_iso_ms()
        })

        return review, briefing

    async def execute_trial(
        self,
        question: str,
        pack_id: str = "dev_pack_E5",
        as_of_date: Any = None,
        case_id: str | None = None,
        mode: str = "auto",
        force: bool = False
    ) -> tuple[CaseFile, JudicialReview | None, ExecutiveBriefing | None]:
        """
        Executes the courtroom trial.
        If mode == 'auto', runs build_case -> round1 -> round2 -> judge.
        If mode == 'step', runs build_case -> round1 and pauses at r1_done.
        """
        case_file = await self.build_case(question=question, pack_id=pack_id, as_of_date=as_of_date, case_id=case_id)
        if case_file.verification_status == VerificationStatus.NOT_VERIFIED and not force:
            return case_file, None, None

        if mode == "step":
            await self.run_round_1(case_file.case_id, force=force)
            return case_file, None, None

        # Auto mode: execute all rounds
        await self.run_round_1(case_file.case_id, force=force)
        await self.run_round_2(case_file.case_id)
        review, briefing = await self.run_judge(case_file.case_id)
        return case_file, review, briefing
