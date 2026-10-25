from __future__ import annotations
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any
from app.config import settings
from app.models.case import CaseFile, VerificationStatus
from app.models.claim import Claim, ClaimStatus
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

    async def _emit_controller_trace(self, case_id: str, run_id: str, event_type: str, **payload: Any) -> None:
        try:
            ev = TraceEvent(
                trace_id=str(uuid.uuid4()),
                case_id=case_id,
                run_id=run_id,
                agent="controller",
                timestamp=datetime.now(timezone.utc),
                event_type=event_type,
                payload=payload
            )
            await self.trace_sink.emit(ev)
        except Exception as e:
            log.warning("Controller trace error: %s", e)

    async def execute_trial(
        self,
        question: str,
        pack_id: str = "dev_pack_E5",
        as_of_date: Any = None,
        case_id: str | None = None
    ) -> tuple[CaseFile, JudicialReview, ExecutiveBriefing | None]:
        case_id = case_id or str(uuid.uuid4())
        run_number = 1
        run_id = f"{case_id}-run-{run_number}"

        await self._emit_controller_trace(case_id, run_id, "TRIAL_STARTED", state=TrialState.INTAKE.value)

        # -------------------------------------------------------------
        # 1. HEIMDALL EVENT VERIFICATION
        # -------------------------------------------------------------
        await self._emit_controller_trace(case_id, run_id, "STATE_TRANSITION", state=TrialState.EVENT_VERIFICATION.value)
        case_file = await self.heimdall.build_case(
            question=question,
            pack_id=pack_id,
            case_id=case_id,
            run_number=run_number,
            supplied_as_of=as_of_date
        )

        if self.case_repo:
            await self.case_repo.save_case(case_file)

        # If event is NOT_VERIFIED: STOP THE TRIAL immediately!
        if case_file.verification_status == VerificationStatus.NOT_VERIFIED:
            await self._emit_controller_trace(
                case_id, run_id, "TRIAL_ABORTED",
                reason="Event could not be verified by Heimdall; stopping trial per Section 19."
            )
            empty_review = JudicialReview(
                case_id=case_id, run_number=run_number,
                rulings=[], sufficiency=SufficiencyVerdict.RESEARCH_REQUIRED,
                sufficiency_reasoning="Trial stopped: Event is false or unverified."
            )
            return case_file, empty_review, None

        # Track evidence discovered in Run 1 vs Run 2
        run_1_evidence_ids: set[str] = {e.source_id for e in case_file.verification_evidence}
        run_2_evidence_ids: set[str] = set()

        all_rulings: list[ClaimRuling] = []
        final_review: JudicialReview | None = None

        # -------------------------------------------------------------
        # MULTI-RUN LOOP (MINIMUM 2 RUNS per Section 28)
        # -------------------------------------------------------------
        while run_number <= self.limits.max_runs:
            run_id = f"{case_id}-run-{run_number}"
            await self._emit_controller_trace(
                case_id, run_id, "ROUND_STARTED",
                run_number=run_number, state=TrialState.CONCURRENT_ADVOCACY.value
            )

            # ---------------------------------------------------------
            # 2. CONCURRENT INITIAL ADVOCACY: THOR & LOKI (Section 23)
            # ---------------------------------------------------------
            t_start = datetime.now(timezone.utc).isoformat()
            await self._emit_controller_trace(case_id, run_id, "CONCURRENT_ADVOCACY_DISPATCHED", timestamp=t_start)

            thor_task = asyncio.create_task(
                self.thor.investigate(case_file=case_file, run_id=run_id, prior_queries=case_file.query_history)
            )
            loki_task = asyncio.create_task(
                self.loki.investigate(case_file=case_file, run_id=run_id, prior_queries=case_file.query_history)
            )

            # Run concurrently via asyncio.gather
            thor_report, loki_report = await asyncio.gather(thor_task, loki_task)
            t_done = datetime.now(timezone.utc).isoformat()
            await self._emit_controller_trace(
                case_id, run_id, "CONCURRENT_ADVOCACY_COMPLETED",
                start=t_start, done=t_done,
                thor_claims=len(thor_report.claims), loki_claims=len(loki_report.claims)
            )

            if self.case_repo:
                for c in thor_report.claims:
                    await self.case_repo.save_claim(case_id, c)
                for c in loki_report.claims:
                    await self.case_repo.save_claim(case_id, c)

            # Record evidence IDs seen in this run
            for c in thor_report.claims + loki_report.claims:
                if run_number == 1:
                    run_1_evidence_ids.update(c.evidence_ids)
                else:
                    run_2_evidence_ids.update(c.evidence_ids)

            # ---------------------------------------------------------
            # 3. CROSS-EXAMINATION (Section 24)
            # ---------------------------------------------------------
            await self._emit_controller_trace(case_id, run_id, "STATE_TRANSITION", state=TrialState.CROSS_EXAMINATION.value)
            thor_cross_task = asyncio.create_task(self.thor.cross_examine(case_id, run_id, loki_report.claims))
            loki_cross_task = asyncio.create_task(self.loki.cross_examine(case_id, run_id, thor_report.claims))
            thor_cross, loki_cross = await asyncio.gather(thor_cross_task, loki_cross_task)

            all_challenges = thor_cross.challenges + loki_cross.challenges
            if self.case_repo:
                for ch in all_challenges:
                    await self.case_repo.save_challenge(case_id, ch)

            # ---------------------------------------------------------
            # 4. DEFENCE & CONCESSION (Section 25)
            # ---------------------------------------------------------
            await self._emit_controller_trace(case_id, run_id, "STATE_TRANSITION", state=TrialState.DEFENCE_CONCESSION.value)
            filters = SearchFilters(pack_id=case_file.pack_id, as_of_date=case_file.as_of_date, event_id=case_file.event_id)

            thor_defence_task = asyncio.create_task(
                self.thor.respond_to_challenges(case_id, run_id, loki_cross.challenges, filters, thor_report.claims)
            )
            loki_defence_task = asyncio.create_task(
                self.loki.respond_to_challenges(case_id, run_id, thor_cross.challenges, filters, loki_report.claims)
            )
            thor_defences, loki_defences = await asyncio.gather(thor_defence_task, loki_defence_task)
            all_defences = thor_defences.responses + loki_defences.responses

            # ---------------------------------------------------------
            # 5. ODIN JUDICIAL REVIEW (Section 26 & 27)
            # ---------------------------------------------------------
            await self._emit_controller_trace(case_id, run_id, "STATE_TRANSITION", state=TrialState.JUDICIAL_REVIEW.value)

            # Enforce minimum runs: Run 1 must request research to guarantee Section 28 requirement
            force_sufficient = (run_number >= self.limits.min_demo_runs)
            review = await self.odin.judge_round(
                case_file=case_file,
                thor_claims=thor_report.claims,
                loki_claims=loki_report.claims,
                challenges=all_challenges,
                defences=all_defences,
                run_number=run_number,
                force_sufficiency=force_sufficient
            )

            all_rulings.extend(review.rulings)
            if self.case_repo:
                for r in review.rulings:
                    await self.case_repo.save_ruling(case_id, r)

            final_review = review

            # Check if second run is required
            if review.sufficiency == SufficiencyVerdict.RESEARCH_REQUIRED and run_number < self.limits.max_runs:
                await self._emit_controller_trace(
                    case_id, run_id, TraceEventType.RETRIAL_STARTED.value,
                    run_number=run_number + 1, research_gaps=review.research_gaps
                )
                run_number += 1

                # Heimdall reopens research with NEW evidence search
                case_file = await self.heimdall.build_case(
                    question=question,
                    pack_id=pack_id,
                    case_id=case_id,
                    run_number=run_number,
                    supplied_as_of=case_file.as_of_date,
                    research_gaps=review.research_gaps,
                    prior_queries=case_file.query_history
                )
                if self.case_repo:
                    await self.case_repo.save_case(case_file)
            else:
                break

        # -------------------------------------------------------------
        # 6. INVARIANT CHECK: Run 2 MUST contain new evidence (Section 28)
        # -------------------------------------------------------------
        new_evidence_delta = run_2_evidence_ids - run_1_evidence_ids
        await self._emit_controller_trace(
            case_id, run_id, "EVIDENCE_INVARIANT_AUDIT",
            run_1_evidence_count=len(run_1_evidence_ids),
            run_2_new_evidence_count=len(new_evidence_delta),
            has_new_evidence=bool(new_evidence_delta) or run_number < 2
        )

        # -------------------------------------------------------------
        # 7. COMMERCIAL EXPOSURE CALCULATION (Section 17 & 41)
        # -------------------------------------------------------------
        trade_rows: list[TradeRow] = []
        if self.trade_repo:
            trade_rows = await self.trade_repo.query_trade_rows()

        exposure_matrix: list[CountrySectorExposure] = []
        for country in case_file.countries:
            for sector in case_file.sectors:
                # Find matching thor and loki claims
                t_claims = [c for c in thor_report.claims if c.country.lower() == country.lower() and c.sector.lower() == sector.lower()]
                l_claims = [c for c in loki_report.claims if c.country.lower() == country.lower() and c.sector.lower() == sector.lower()]

                t_low = t_claims[0].low_estimate if t_claims else None
                t_high = t_claims[0].high_estimate if t_claims else None
                l_low = l_claims[0].low_estimate if l_claims else None
                l_high = l_claims[0].high_estimate if l_claims else None

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

        # -------------------------------------------------------------
        # 8. ODIN FINAL BRIEFING (Section 40)
        # -------------------------------------------------------------
        await self._emit_controller_trace(case_id, run_id, "STATE_TRANSITION", state=TrialState.FINAL_BRIEFING.value)

        citations_list = [{"doc_id": r.source_id, "title": r.title} for r in case_file.verification_evidence]
        briefing = await self.odin.author_final_briefing(
            case_file=case_file,
            rulings=all_rulings,
            exposure_matrix=exposure_matrix,
            evidence_citations=citations_list
        )

        if self.case_repo:
            await self.case_repo.save_briefing(case_id, briefing)

        await self._emit_controller_trace(case_id, run_id, "TRIAL_COMPLETED", briefing_id=briefing.briefing_id)
        return case_file, final_review or review, briefing
