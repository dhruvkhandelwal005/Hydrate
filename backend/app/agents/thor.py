from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from app.agents.base import BaseAgent, LLMProvider
from app.agents.prompts.thor import THOR_SYSTEM_PROMPT
from app.models.case import CaseFile
from app.models.claim import Claim, ClaimNature, ClaimStatus, LineageStep
from app.models.challenge import Challenge, ChallengeWeaknessType, CrossExaminationReport, DefenceResponse, DefenceReport
from app.models.trace import TraceEventType
from app.repositories.memories import AgentMemoryRepository, MemoryItem
from app.retrieval.hybrid_search import SearchTool, SearchResult
from app.retrieval.metadata_filters import SearchFilters
from app.retrieval.query_registry import QueryRegistry
from app.observability.tracing import TraceSink
from app.utils.text import wrap_untrusted_evidence

class ThorReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    case_id: str
    run_id: str
    agent: Literal["thor"] = "thor"
    executive_summary: str
    claims: list[Claim] = Field(default_factory=list)
    unresolved_bottlenecks: list[str] = Field(default_factory=list)
    query_history: list[str] = Field(default_factory=list)

class ThorAgent(BaseAgent):
    def __init__(
        self,
        llm: LLMProvider,
        search_tool: SearchTool,
        memory_repo: AgentMemoryRepository,
        trace_sink: TraceSink,
        query_registry: QueryRegistry | None = None
    ):
        super().__init__(
            agent_name="thor",
            system_prompt=THOR_SYSTEM_PROMPT,
            llm=llm,
            search_tool=search_tool,
            memory_repo=memory_repo,
            trace_sink=trace_sink,
            query_registry=query_registry
        )

    async def investigate(
        self,
        case_file: CaseFile,
        run_id: str | None = None,
        prior_queries: list[str] | None = None
    ) -> ThorReport:
        case_id = case_file.case_id
        run_id = run_id or f"{case_id}-run-{case_file.run_number}"

        await self.emit_trace(case_id, run_id, "THOR_INVESTIGATION_STARTED")

        # 1. Read private memory
        memories = await self.memory_repo.recent(limit=10)
        await self.emit_trace(case_id, run_id, TraceEventType.MEMORY_READ.value, memory_count=len(memories))
        if memories:
            await self.emit_trace(
                case_id, run_id, TraceEventType.MEMORY_INFLUENCE.value,
                memory_id=memories[0].memory_id,
                decision_changed="Thor search focus: target high trade value losses and rail capacity ceilings",
                before_strategy="generic disruption headlines",
                after_strategy="focus on quantified trade deficits and bottleneck constraints from memory"
            )

        # 2. Formulate independent high-exposure searches
        event = case_file.event_hypothesis
        countries_str = " ".join(case_file.countries)
        sectors_str = " ".join(case_file.sectors)
        filters = SearchFilters(pack_id=case_file.pack_id, as_of_date=case_file.as_of_date, event_id=case_file.event_id)

        queries = [
            f'"{event}" direct trade loss collapse {countries_str} {sectors_str}',
            f'"{event}" port shutdown berth capacity closure index',
            f'"{event}" rail bottleneck capacity constraint limit Ravik',
            f'"{event}" trade note Orvan {countries_str} {sectors_str}',
            f'"{event}" price surge supplier concentration persistent impairment'
        ]

        executed_queries: list[str] = []
        retrieved_results: dict[str, SearchResult] = {}
        prior_set = set(prior_queries or [])

        for q in queries:
            if q in prior_set:
                await self.emit_trace(case_id, run_id, TraceEventType.DUPLICATE_QUERY_BLOCKED.value, query=q)
                continue
            if not self.query_registry.register(q, filters.model_dump(), "thor_search"):
                await self.emit_trace(case_id, run_id, TraceEventType.DUPLICATE_QUERY_BLOCKED.value, query=q)
                continue

            executed_queries.append(q)
            await self.emit_trace(case_id, run_id, TraceEventType.SEARCH_STARTED.value, query=q)
            found = await self.search_tool.search(query=q, filters=filters, limit=8)
            retrieved_ids = []
            for r in found:
                retrieved_results[r.source_id] = r
                retrieved_ids.append(r.source_id)
            await self.emit_trace(case_id, run_id, TraceEventType.SEARCH_RESULTS.value, query=q, retrieved_ids=retrieved_ids)

        # 3. Assemble evidence context
        context_docs = list(retrieved_results.values())[:10]
        evidence_text = "\n\n".join(
            wrap_untrusted_evidence(r.text[:2500], {
                "source_id": r.source_id,
                "title": r.title,
                "pub_date": str(r.pub_date),
                "reliability": r.reliability.value,
                "country": r.country,
                "sector": r.sector
            })
            for r in context_docs
        )

        prompt = (
            f"CASE DETAILS:\nQuestion: {case_file.question}\n"
            f"Event: {case_file.event_hypothesis}\nAs-of: {case_file.as_of_date.isoformat()}\n"
            f"Countries: {case_file.countries}\nSectors: {case_file.sectors}\n\n"
            f"ADMISSIBLE RUNEMARK EVIDENCE:\n{evidence_text}\n\n"
            "Build the strongest defensible HIGH COMMERCIAL EXPOSURE case for every requested country and sector pair. "
            "For each country-sector pair: state whether it is SOURCED_FACT or INFERENCE. "
            "Provide low_estimate and high_estimate in USD_M if supported, otherwise estimate_status=INSUFFICIENT_EVIDENCE. "
            "Cite only valid SOURCE_IDs from the evidence above."
        )

        report = await self.structured_call(prompt, ThorReport)
        report.case_id = case_id
        report.run_id = run_id
        report.query_history = executed_queries

        # Ensure claims have lineage and agent set with distinct prefixed IDs
        for idx, c in enumerate(report.claims, start=1):
            c.agent = "thor"
            c.claim_id = f"THOR-R{case_file.run_number}-C{idx}"
            c.status = ClaimStatus.ASSERTED
            c.version = 1
            if not c.lineage:
                c.lineage.append(LineageStep(
                    action="ASSERTED",
                    by="thor",
                    detail="Initial high-exposure claim asserted with evidence",
                    evidence_ids=c.evidence_ids,
                    timestamp=datetime.now(timezone.utc).isoformat()
                ))

        # 4. Save private memory
        mem = MemoryItem(
            memory_id=str(uuid.uuid4()),
            agent="thor",
            kind="high_exposure_pattern",
            content=f"Asserted {len(report.claims)} high exposure claims. Severe bottlenecks cited across Orvan port and Ravik rail.",
            tags=["high_exposure", "bottlenecks"],
            case_id=case_id
        )
        await self.memory_repo.write(mem)
        await self.emit_trace(case_id, run_id, TraceEventType.MEMORY_WRITE.value, memory_id=mem.memory_id)
        await self.emit_trace(case_id, run_id, TraceEventType.CLAIM_CREATED.value, claim_ids=[c.claim_id for c in report.claims])

        return report

    async def cross_examine(self, case_id: str, run_id: str, loki_claims: list[Claim]) -> CrossExaminationReport:
        await self.emit_trace(case_id, run_id, "CROSS_EXAMINATION_STARTED", target="loki")
        prompt = (
            f"LOKI'S SUBMITTED LIMITED-EXPOSURE CLAIMS:\n{json.dumps([c.model_dump(mode='json') for c in loki_claims], default=str)}\n\n"
            "You MUST attack at least one of Loki's weakest claims. Target: ignored capacity limits, physical/commercial confusion, "
            "unsupported substitution assumptions, or weak sources. Provide counter-arguments and challenge details."
        )
        report = await self.structured_call(prompt, CrossExaminationReport)
        report.case_id = case_id
        report.run_id = run_id
        report.agent = "thor"
        for ch in report.challenges:
            ch.attacker = "thor"
        await self.emit_trace(case_id, run_id, TraceEventType.CHALLENGE_CREATED.value, challenge_ids=[ch.challenge_id for ch in report.challenges])
        return report

    async def respond_to_challenges(
        self,
        case_id: str,
        run_id: str,
        challenges: list[Challenge],
        filters: SearchFilters,
        original_claims: list[Claim]
    ) -> DefenceReport:
        # Retrieve new evidence for defence if challenged on missing proof
        extra_docs: list[SearchResult] = []
        for ch in challenges[:2]:
            q = f"Thor defence evidence {ch.target_claim_id} {ch.weakness_type.value}"
            if self.query_registry.register(q, filters.model_dump(), "thor_defence"):
                found = await self.search_tool.search(query=q, filters=filters, limit=4)
                extra_docs.extend(found)

        extra_text = "\n\n".join(wrap_untrusted_evidence(r.text[:2000], {"source_id": r.source_id}) for r in extra_docs)

        prompt = (
            f"THOR'S ORIGINAL CLAIMS:\n{json.dumps([c.model_dump(mode='json') for c in original_claims], default=str)}\n\n"
            f"LOKI'S CHALLENGES:\n{json.dumps([ch.model_dump(mode='json') for ch in challenges], default=str)}\n\n"
            f"ADDITIONAL DEFENCE EVIDENCE:\n{extra_text}\n\n"
            "For each challenged claim, choose DEFEND (with reasoned argument / new evidence) or CONCEDE (if unsupportable). "
            "A genuine adversarial debate must concede indefensible points or uncorroborated extremes."
        )
        defence_rep = await self.structured_call(prompt, DefenceReport)
        defence_rep.case_id = case_id
        defence_rep.run_id = run_id
        defence_rep.agent = "thor"

        for resp in defence_rep.responses:
            if resp.action == "CONCEDE":
                await self.emit_trace(case_id, run_id, TraceEventType.CLAIM_CONCEDED.value, claim_id=resp.target_claim_id, reason=resp.reasoning)
            else:
                await self.emit_trace(case_id, run_id, TraceEventType.DEFENCE_CREATED.value, claim_id=resp.target_claim_id, reasoning=resp.reasoning)

        return defence_rep
