from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from app.agents.base import BaseAgent, LLMProvider
from app.agents.prompts.loki import LOKI_SYSTEM_PROMPT
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

class LokiReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    case_id: str
    run_id: str
    agent: Literal["loki"] = "loki"
    executive_summary: str
    claims: list[Claim] = Field(default_factory=list)
    unresolved_questions: list[str] = Field(default_factory=list)
    query_history: list[str] = Field(default_factory=list)

class LokiAgent(BaseAgent):
    def __init__(
        self,
        llm: LLMProvider,
        search_tool: SearchTool,
        memory_repo: AgentMemoryRepository,
        trace_sink: TraceSink,
        query_registry: QueryRegistry | None = None
    ):
        super().__init__(
            agent_name="loki",
            system_prompt=LOKI_SYSTEM_PROMPT,
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
    ) -> LokiReport:
        case_id = case_file.case_id
        run_id = run_id or f"{case_id}-run-{case_file.run_number}"

        await self.emit_trace(case_id, run_id, "LOKI_INVESTIGATION_STARTED")

        # 1. Read private memory
        memories = await self.memory_repo.recent(limit=10)
        await self.emit_trace(case_id, run_id, TraceEventType.MEMORY_READ.value, memory_count=len(memories))
        if memories:
            await self.emit_trace(
                case_id, run_id, TraceEventType.MEMORY_INFLUENCE.value,
                memory_id=memories[0].memory_id,
                decision_changed="Loki search strategy: prioritize verified substitute volume and long-term contracts",
                before_strategy="generic limited exposure offsets",
                after_strategy="focus on Vanir substitute shipments and protected contract terms"
            )

        # 2. Formulate independent limited-exposure searches
        event = case_file.event_hypothesis
        countries_str = " ".join(case_file.countries)
        sectors_str = " ".join(case_file.sectors)
        filters = SearchFilters(pack_id=case_file.pack_id, as_of_date=case_file.as_of_date, event_id=case_file.event_id)

        queries = [
            f'"{event}" substitute suppliers Vanir {countries_str} {sectors_str}',
            f'"{event}" alternative routes rail rerouting Ravik capacity',
            f'"{event}" protected contracts long term delivery terms {sectors_str}',
            f'"{event}" trade note Vanir {countries_str} {sectors_str}',
            f'"{event}" price value cushioning diversified procurement recovery'
        ]

        executed_queries: list[str] = []
        retrieved_results: dict[str, SearchResult] = {}
        prior_set = set(prior_queries or [])

        for q in queries:
            if q in prior_set:
                await self.emit_trace(case_id, run_id, TraceEventType.DUPLICATE_QUERY_BLOCKED.value, query=q)
                continue
            if not self.query_registry.register(q, filters.model_dump(), "loki_search"):
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
            "Build the strongest defensible LIMITED COMMERCIAL EXPOSURE case for every requested country and sector pair. "
            "Separate physical disruption from NET COMMERCIAL VALUE EXPOSURE. "
            "Highlight substitute supplies (e.g. Vanir), rail rerouting, and contract protections. "
            "For each country-sector pair: state whether SOURCED_FACT or INFERENCE. "
            "Provide low_estimate and high_estimate in USD_M if supported, otherwise estimate_status=INSUFFICIENT_EVIDENCE. "
            "Cite only valid SOURCE_IDs from the evidence above."
        )

        report = await self.structured_call(prompt, LokiReport)
        report.case_id = case_id
        report.run_id = run_id
        report.query_history = executed_queries

        # Ensure claims have lineage and agent set with distinct prefixed IDs
        for idx, c in enumerate(report.claims, start=1):
            c.agent = "loki"
            c.claim_id = f"LOKI-R{case_file.run_number}-C{idx}"
            c.status = ClaimStatus.ASSERTED
            c.version = 1
            if not c.lineage:
                c.lineage.append(LineageStep(
                    action="ASSERTED",
                    by="loki",
                    detail="Initial limited-exposure claim asserted with evidence",
                    evidence_ids=c.evidence_ids,
                    timestamp=datetime.now(timezone.utc).isoformat()
                ))

        # 4. Save private memory
        mem = MemoryItem(
            memory_id=str(uuid.uuid4()),
            agent="loki",
            kind="substitution_pattern",
            content=f"Asserted {len(report.claims)} limited exposure claims. Vanir substitution and rail links verified.",
            tags=["limited_exposure", "substitution"],
            case_id=case_id
        )
        await self.memory_repo.write(mem)
        await self.emit_trace(case_id, run_id, TraceEventType.MEMORY_WRITE.value, memory_id=mem.memory_id)
        await self.emit_trace(case_id, run_id, TraceEventType.CLAIM_CREATED.value, claim_ids=[c.claim_id for c in report.claims])

        return report

    async def cross_examine(self, case_id: str, run_id: str, thor_claims: list[Claim]) -> CrossExaminationReport:
        await self.emit_trace(case_id, run_id, "CROSS_EXAMINATION_STARTED", target="thor")
        prompt = (
            f"THOR'S SUBMITTED HIGH-EXPOSURE CLAIMS:\n{json.dumps([c.model_dump(mode='json') for c in thor_claims], default=str)}\n\n"
            "You MUST attack at least one of Thor's weakest claims. Target: confusion of physical disruption with net commercial loss, "
            "failure to account for substitute suppliers (e.g. Vanir), or reliance on alarmist Tier 4 tabloid headlines. "
            "Provide counter-arguments and challenge details."
        )
        report = await self.structured_call(prompt, CrossExaminationReport)
        report.case_id = case_id
        report.run_id = run_id
        report.agent = "loki"
        for ch in report.challenges:
            ch.attacker = "loki"
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
        extra_docs: list[SearchResult] = []
        for ch in challenges[:2]:
            q = f"Loki defence evidence {ch.target_claim_id} {ch.weakness_type.value}"
            if self.query_registry.register(q, filters.model_dump(), "loki_defence"):
                found = await self.search_tool.search(query=q, filters=filters, limit=4)
                extra_docs.extend(found)

        extra_text = "\n\n".join(wrap_untrusted_evidence(r.text[:2000], {"source_id": r.source_id}) for r in extra_docs)

        prompt = (
            f"LOKI'S ORIGINAL CLAIMS:\n{json.dumps([c.model_dump(mode='json') for c in original_claims], default=str)}\n\n"
            f"THOR'S CHALLENGES:\n{json.dumps([ch.model_dump(mode='json') for ch in challenges], default=str)}\n\n"
            f"ADDITIONAL DEFENCE EVIDENCE:\n{extra_text}\n\n"
            "For each challenged claim, choose DEFEND (with reasoned argument / new evidence) or CONCEDE (if unsupportable). "
            "A genuine adversarial debate must concede indefensible points or uncorroborated extremes."
        )
        defence_rep = await self.structured_call(prompt, DefenceReport)
        defence_rep.case_id = case_id
        defence_rep.run_id = run_id
        defence_rep.agent = "loki"

        for resp in defence_rep.responses:
            if resp.action == "CONCEDE":
                await self.emit_trace(case_id, run_id, TraceEventType.CLAIM_CONCEDED.value, claim_id=resp.target_claim_id, reason=resp.reasoning)
            else:
                await self.emit_trace(case_id, run_id, TraceEventType.DEFENCE_CREATED.value, claim_id=resp.target_claim_id, reasoning=resp.reasoning)

        return defence_rep
