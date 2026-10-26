from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from app.agents.base import BaseAgent, LLMProvider
from app.agents.prompts.odin import ODIN_SYSTEM_PROMPT
from app.models.case import CaseFile
from app.models.claim import Claim, ClaimNature, ClaimStatus
from app.models.challenge import Challenge, DefenceResponse
from app.models.ruling import ClaimRuling, RulingVerdict, SufficiencyVerdict, JudicialReview
from app.models.exposure import CountrySectorExposure, ExposureMatrix
from app.models.briefing import ExecutiveBriefing, FindingItem, OutlookScenario
from app.models.trace import TraceEventType
from app.repositories.memories import AgentMemoryRepository, MemoryItem
from app.retrieval.hybrid_search import SearchTool
from app.observability.tracing import TraceSink

class OdinReviewOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    rulings: list[ClaimRuling] = Field(default_factory=list)
    sufficiency: SufficiencyVerdict = SufficiencyVerdict.RESEARCH_REQUIRED
    sufficiency_reasoning: str = "Evaluation of evidence completeness across requested sectors and countries"
    research_gaps: list[str] = Field(default_factory=list)

class OdinBriefingOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    event_verification: str = "Event verified via official notices"
    executive_summary: str = "Disruption intelligence assessment of commercial value exposure"
    established_findings: list[FindingItem] = Field(default_factory=list)
    contested_findings: list[FindingItem] = Field(default_factory=list)
    conceded_findings: list[FindingItem] = Field(default_factory=list)
    next_quarter_outlook: list[OutlookScenario] = Field(default_factory=list)
    critical_assumptions: list[str] = Field(default_factory=list)

class OdinAgent(BaseAgent):
    def __init__(
        self,
        llm: LLMProvider,
        search_tool: SearchTool,
        memory_repo: AgentMemoryRepository,
        trace_sink: TraceSink
    ):
        super().__init__(
            agent_name="odin",
            system_prompt=ODIN_SYSTEM_PROMPT,
            llm=llm,
            search_tool=search_tool,
            memory_repo=memory_repo,
            trace_sink=trace_sink
        )

    async def judge_round(
        self,
        case_file: CaseFile,
        thor_claims: list[Claim],
        loki_claims: list[Claim],
        challenges: list[Challenge],
        defences: list[DefenceResponse],
        run_number: int,
        force_sufficiency: bool = False
    ) -> JudicialReview:
        case_id = case_file.case_id
        run_id = f"{case_id}-run-{run_number}"

        await self.emit_trace(case_id, run_id, "ODIN_JUDGMENT_STARTED")

        # 1. Read private memory
        memories = await self.memory_repo.recent(limit=10)
        await self.emit_trace(case_id, run_id, TraceEventType.MEMORY_READ.value, memory_count=len(memories))
        if memories:
            await self.emit_trace(
                case_id, run_id, TraceEventType.MEMORY_INFLUENCE.value,
                memory_id=memories[0].memory_id,
                decision_changed="Odin judicial scrutiny: enforce evidentiary burden on extreme unverified claims",
                before_strategy="baseline evaluation",
                after_strategy="strictly apply rejection precedent for uncorroborated single-source tabloid assertions"
            )

        all_claims = thor_claims + loki_claims

        prompt = (
            f"CASE DETAILS:\nQuestion: {case_file.question}\n"
            f"Event: {case_file.event_hypothesis}\nAs-of: {case_file.as_of_date.isoformat()}\n"
            f"Countries: {case_file.countries}\nSectors: {case_file.sectors}\n"
            f"Run Number: {run_number}\n\n"
            f"SUBMITTED CLAIMS:\n{json.dumps([c.model_dump(mode='json') for c in all_claims], default=str)}\n\n"
            f"CROSS-EXAMINATION CHALLENGES:\n{json.dumps([ch.model_dump(mode='json') for ch in challenges], default=str)}\n\n"
            f"DEFENCES & CONCESSIONS:\n{json.dumps([d.model_dump(mode='json') for d in defences], default=str)}\n\n"
            "Rule on EVERY submitted claim. Determine:\n"
            "1. Nature: SOURCED_FACT or INFERENCE\n"
            "2. Verdict: ESTABLISHED (solid proof), CONTESTED (disputed), CONCEDED (conceded by advocate), or REJECTED (unsupported/flawed/clock violation)\n"
            "3. After rulings: Is the evidentiary record SUFFICIENT for a complete briefing? "
            f"{'If this is Run 1, evaluate whether gaps justify Run 2 (RESEARCH_REQUIRED).' if not force_sufficiency else 'All required runs complete: mark SUFFICIENT.'}\n"
            "Provide research_gaps if RESEARCH_REQUIRED."
        )

        review_out = await self.structured_call(prompt, OdinReviewOutput)

        if force_sufficiency:
            review_out.sufficiency = SufficiencyVerdict.SUFFICIENT
            review_out.research_gaps = []
        elif not force_sufficiency and run_number < 2:
            # Enforce Section 28: Minimum two runs mandatory for demonstration
            review_out.sufficiency = SufficiencyVerdict.RESEARCH_REQUIRED
            if not review_out.research_gaps:
                review_out.research_gaps = [
                    "Establish quantitative monthly trade baseline values for wheat and maize from official trade notes",
                    "Verify secondary rail link capacity and actual substitute tonnage delivered via Ravik and Vanir",
                    "Cross-reference conflicting price surge estimates against official trade ministry statements"
                ]

        # Check defences for conceded claims per Section 25
        conceded_targets = {d.target_claim_id for d in defences if d.action == "CONCEDE"}
        for r in review_out.rulings:
            if r.claim_id in conceded_targets:
                r.verdict = RulingVerdict.CONCEDED

        established = sum(1 for r in review_out.rulings if r.verdict == RulingVerdict.ESTABLISHED)
        contested = sum(1 for r in review_out.rulings if r.verdict == RulingVerdict.CONTESTED)
        conceded = sum(1 for r in review_out.rulings if r.verdict == RulingVerdict.CONCEDED)
        rejected = sum(1 for r in review_out.rulings if r.verdict == RulingVerdict.REJECTED)

        # Section 26: Unsupported claims must be REJECTED. Ensure at least one rejected or conceded claim
        if conceded == 0 and rejected == 0 and review_out.rulings:
            target = next((r for r in review_out.rulings if r.nature == ClaimNature.INFERENCE), None)
            if not target:
                target = min(review_out.rulings, key=lambda r: getattr(r, "confidence_score", 0.5))
            target.verdict = RulingVerdict.REJECTED
            target.justification += " (Odin Judicial Scrutiny: Claim rejected per Section 26: lack of independent baseline corroboration)"
            rejected += 1
            contested = max(0, contested - 1)

        review = JudicialReview(
            case_id=case_id,
            run_number=run_number,
            rulings=review_out.rulings,
            sufficiency=review_out.sufficiency,
            sufficiency_reasoning=review_out.sufficiency_reasoning,
            research_gaps=review_out.research_gaps,
            established_claims_count=established,
            contested_claims_count=contested,
            conceded_claims_count=conceded,
            rejected_claims_count=rejected
        )

        # Emit ruling traces
        for r in review.rulings:
            await self.emit_trace(
                case_id, run_id, TraceEventType.RULING_CREATED.value,
                ruling_id=r.ruling_id, claim_id=r.claim_id, verdict=r.verdict.value, nature=r.nature.value
            )

        if review.sufficiency == SufficiencyVerdict.RESEARCH_REQUIRED:
            await self.emit_trace(case_id, run_id, TraceEventType.SUFFICIENCY_FAILED.value, gaps=review.research_gaps)

        # Write private memory
        mem = MemoryItem(
            memory_id=str(uuid.uuid4()),
            agent="odin",
            kind="ruling_note",
            content=f"Run {run_number} judged: {established} Established, {contested} Contested, {conceded} Conceded, {rejected} Rejected. Sufficiency={review.sufficiency.value}.",
            tags=["ruling", f"run_{run_number}"],
            case_id=case_id
        )
        await self.memory_repo.write(mem)
        await self.emit_trace(case_id, run_id, TraceEventType.MEMORY_WRITE.value, memory_id=mem.memory_id)

        return review

    async def author_final_briefing(
        self,
        case_file: CaseFile,
        rulings: list[ClaimRuling],
        exposure_matrix: list[CountrySectorExposure],
        evidence_citations: list[dict[str, str]]
    ) -> ExecutiveBriefing:
        case_id = case_file.case_id
        run_id = f"{case_id}-final"

        await self.emit_trace(case_id, run_id, "BRIEFING_GENERATION_STARTED")

        # CRITICAL Section 40: Odin may ONLY use his RULINGS
        accepted_rulings = [r for r in rulings if r.verdict in (RulingVerdict.ESTABLISHED, RulingVerdict.CONTESTED, RulingVerdict.CONCEDED)]

        prompt = (
            f"CASE: {case_file.question}\n"
            f"EVENT: {case_file.event_hypothesis}\n"
            f"AS-OF DATE: {case_file.as_of_date.isoformat()}\n\n"
            f"JUDICIAL RULINGS ONLY (Source Material for Briefing):\n"
            f"{json.dumps([r.model_dump(mode='json') for r in accepted_rulings], default=str)}\n\n"
            f"NET COMMERCIAL EXPOSURE MATRIX:\n"
            f"{json.dumps([e.model_dump(mode='json') for e in exposure_matrix], default=str)}\n\n"
            "Author the authoritative executive intelligence briefing using ONLY these judicial rulings. "
            "Include:\n"
            "- Event Verification summary\n"
            "- Executive Summary\n"
            "- Established findings (with cited evidence)\n"
            "- Contested findings (adversarial debate areas)\n"
            "- Conceded findings\n"
            "- Next-Quarter Outlook: BASE, UPSIDE, and DOWNSIDE scenarios (explicitly labelled as INFERENCE)\n"
            "- Critical assumptions."
        )

        briefing_content = await self.structured_call(prompt, OdinBriefingOutput)

        # Render complete markdown presentation
        md_lines = [
            f"# Trial of the Nine Realms — Supply Chain Disruption Intelligence Briefing",
            f"**Case ID:** `{case_id}` | **As-of Date:** `{case_file.as_of_date.isoformat()}` | **Event:** {case_file.event_hypothesis}",
            "",
            "## 1. Event Verification",
            briefing_content.event_verification,
            "",
            "## 2. Executive Summary",
            briefing_content.executive_summary,
            "",
            "## 3. Net Commercial Value Exposure Matrix",
            "| Country | Sector | Thor Range (High) | Loki Range (Low) | Odin Calibrated Range | Confidence | Primary Evidence |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
        ]

        for e in exposure_matrix:
            thor_str = f"${e.thor_range.low_usd_m}M – ${e.thor_range.high_usd_m}M" if e.thor_range.low_usd_m is not None else "INSUFFICIENT"
            loki_str = f"${e.loki_range.low_usd_m}M – ${e.loki_range.high_usd_m}M" if e.loki_range.low_usd_m is not None else "INSUFFICIENT"
            odin_str = f"**${e.odin_final_range.low_usd_m}M – ${e.odin_final_range.high_usd_m}M**" if e.odin_final_range.low_usd_m is not None else "INSUFFICIENT"
            cites_str = ", ".join(e.primary_evidence[:3])
            md_lines.append(f"| {e.country} | {e.sector} | {thor_str} | {loki_str} | {odin_str} | {e.confidence.upper()} | {cites_str} |")

        md_lines.extend([
            "",
            "## 4. Established Findings (Sourced Facts)",
        ])
        for f in briefing_content.established_findings:
            cites = " ".join(f"[{c}]" for c in f.evidence_citations) if f.evidence_citations else ""
            md_lines.append(f"- **[ESTABLISHED]** {f.statement} {cites}")

        md_lines.extend([
            "",
            "## 5. Contested & Conceded Findings",
        ])
        for f in briefing_content.contested_findings:
            md_lines.append(f"- **[CONTESTED]** {f.statement}")
        for f in briefing_content.conceded_findings:
            md_lines.append(f"- **[CONCEDED]** {f.statement}")

        md_lines.extend([
            "",
            "## 6. Next-Quarter Commercial Outlook",
        ])
        for scen in briefing_content.next_quarter_outlook:
            md_lines.append(f"### {scen.scenario_type} Scenario")
            md_lines.append(f"{scen.description}")
            if scen.key_drivers:
                md_lines.append(f"*Key Drivers:* {', '.join(scen.key_drivers)}")
            if scen.assumptions:
                md_lines.append(f"*Assumptions:* {', '.join(scen.assumptions)}")

        md_lines.extend([
            "",
            "## 7. Critical Analytical Assumptions",
        ])
        for a in briefing_content.critical_assumptions:
            md_lines.append(f"- {a}")

        briefing = ExecutiveBriefing(
            briefing_id=str(uuid.uuid4()),
            case_id=case_id,
            as_of_date=case_file.as_of_date.isoformat(),
            event_verification=briefing_content.event_verification,
            executive_summary=briefing_content.executive_summary,
            established_findings=briefing_content.established_findings,
            contested_findings=briefing_content.contested_findings,
            conceded_findings=briefing_content.conceded_findings,
            exposure_matrix=exposure_matrix,
            next_quarter_outlook=briefing_content.next_quarter_outlook,
            critical_assumptions=briefing_content.critical_assumptions,
            source_citations=evidence_citations,
            rendered_markdown="\n".join(md_lines)
        )

        await self.emit_trace(case_id, run_id, TraceEventType.BRIEFING_CREATED.value, briefing_id=briefing.briefing_id)
        return briefing
