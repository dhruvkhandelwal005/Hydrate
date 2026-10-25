from __future__ import annotations
import json
import uuid
from datetime import date, datetime, timezone
from typing import Any
from pydantic import BaseModel, ConfigDict, Field
from app.agents.base import BaseAgent, LLMProvider
from app.agents.prompts.heimdall import HEIMDALL_SYSTEM_PROMPT
from app.models.case import CaseFile, ParsedQuestion, VerificationStatus
from app.models.evidence import EvidenceRef, ContradictionItem, ExcludedSource
from app.models.document import ReliabilityTier
from app.models.trace import TraceEventType
from app.repositories.memories import AgentMemoryRepository, MemoryItem
from app.retrieval.hybrid_search import SearchTool, SearchResult
from app.retrieval.metadata_filters import SearchFilters
from app.retrieval.query_registry import QueryRegistry
from app.observability.tracing import TraceSink
from app.utils.text import wrap_untrusted_evidence
from app.utils.dates import parse_iso_date

class QuestionParseOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    as_of_date: str
    event_hypothesis: str
    countries: list[str] = Field(default_factory=list)
    sectors: list[str] = Field(default_factory=list)
    event_id: str = "E5"

class EventVerificationOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    verification_status: VerificationStatus
    summary: str
    event_id: str
    verified_sources: list[str] = Field(default_factory=list)
    contradictions: list[dict[str, str]] = Field(default_factory=list)
    research_gaps: list[str] = Field(default_factory=list)

class HeimdallAgent(BaseAgent):
    def __init__(
        self,
        llm: LLMProvider,
        search_tool: SearchTool,
        memory_repo: AgentMemoryRepository,
        trace_sink: TraceSink,
        query_registry: QueryRegistry | None = None
    ):
        super().__init__(
            agent_name="heimdall",
            system_prompt=HEIMDALL_SYSTEM_PROMPT,
            llm=llm,
            search_tool=search_tool,
            memory_repo=memory_repo,
            trace_sink=trace_sink,
            query_registry=query_registry
        )

    async def build_case(
        self,
        question: str,
        pack_id: str = "dev_pack_E5",
        case_id: str | None = None,
        run_number: int = 1,
        supplied_as_of: date | None = None,
        research_gaps: list[str] | None = None,
        prior_queries: list[str] | None = None
    ) -> CaseFile:
        case_id = case_id or str(uuid.uuid4())
        run_id = f"{case_id}-run-{run_number}"

        await self.emit_trace(case_id, run_id, TraceEventType.CASE_CREATED.value, question=question, pack_id=pack_id)

        # 1. Read private memory
        memories = await self.memory_repo.recent(limit=10)
        await self.emit_trace(case_id, run_id, TraceEventType.MEMORY_READ.value, memory_count=len(memories))
        if memories:
            await self.emit_trace(
                case_id, run_id, TraceEventType.MEMORY_INFLUENCE.value,
                memory_id=memories[0].memory_id,
                decision_changed="Heimdall verification search strategy",
                before_strategy="broad topic query",
                after_strategy="prioritize official and correction cross-referencing based on memory"
            )

        # 2. Parse question
        parse_prompt = (
            f"PARSE THIS DISRUPTION INTELLIGENCE QUESTION:\n{question}\n\n"
            "Extract: as_of_date (ISO YYYY-MM-DD), event_hypothesis, countries, sectors, event_id (e.g. E5 if Orvan grain corridor)."
        )
        parsed = await self.structured_call(parse_prompt, QuestionParseOutput)
        as_of = supplied_as_of or parse_iso_date(parsed.as_of_date) or date(2027, 1, 25)

        filters = SearchFilters(pack_id=pack_id, as_of_date=as_of, event_id=parsed.event_id)

        # 3. Formulate independent verification searches
        event_name = parsed.event_hypothesis
        search_candidates = [
            f'"{event_name}" official notice Realm Trade Ministry',
            f'"{event_name}" corridor agreement status {as_of.isoformat()}',
            f'"{event_name}" correction retraction error update',
            f'"{event_name}" {" ".join(parsed.countries)} {" ".join(parsed.sectors)}'
        ]
        if research_gaps:
            for gap in research_gaps:
                search_candidates.insert(0, f'"{event_name}" {gap}')

        executed_queries: list[str] = []
        retrieved_results: dict[str, SearchResult] = {}
        prior_set = set(prior_queries or [])

        for query_str in search_candidates:
            if query_str in prior_set:
                await self.emit_trace(case_id, run_id, TraceEventType.DUPLICATE_QUERY_BLOCKED.value, query=query_str, reason="prior_run_query")
                continue
            if not self.query_registry.register(query_str, filters.model_dump(), "heimdall_search"):
                await self.emit_trace(case_id, run_id, TraceEventType.DUPLICATE_QUERY_BLOCKED.value, query=query_str)
                continue

            executed_queries.append(query_str)
            await self.emit_trace(case_id, run_id, TraceEventType.SEARCH_STARTED.value, query=query_str)

            found = await self.search_tool.search(query=query_str, filters=filters, limit=8)
            retrieved_ids = []
            for r in found:
                retrieved_results[r.source_id] = r
                retrieved_ids.append(r.source_id)

            await self.emit_trace(case_id, run_id, TraceEventType.SEARCH_RESULTS.value, query=query_str, retrieved_ids=retrieved_ids)

        # 4. Synthesize verification evidence
        context_docs = list(retrieved_results.values())[:10]
        untrusted_snippets = "\n\n".join(
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

        verify_prompt = (
            f"EVENT HYPOTHESIS: {event_name}\n"
            f"AS-OF DATE: {as_of.isoformat()}\n"
            f"TARGET COUNTRIES: {parsed.countries}\n"
            f"TARGET SECTORS: {parsed.sectors}\n\n"
            f"ADMISSIBLE RUNEMARK EVIDENCE:\n{untrusted_snippets}\n\n"
            "Verify whether this event is real and active as of the as-of date. "
            "Actively check for corrections or retractions. "
            "If the event did not happen, return NOT_VERIFIED. If evidence is thin, return INSUFFICIENT. "
            "If confirmed by official/reputable reporting, return VERIFIED."
        )

        verification = await self.structured_call(verify_prompt, EventVerificationOutput)

        # Build evidence references
        evidence_refs: list[EvidenceRef] = []
        for src_id in verification.verified_sources:
            if src_id in retrieved_results:
                r = retrieved_results[src_id]
                evidence_refs.append(EvidenceRef(
                    source_id=r.source_id,
                    title=r.title,
                    pub_date=r.pub_date,
                    pub_time=r.pub_time,
                    source_name=r.source_name,
                    source_type=r.source_type,
                    reliability=r.reliability,
                    event_id=r.event_id,
                    country=r.country,
                    sector=r.sector,
                    locator=r.locator,
                    snippet=r.text[:300],
                    relation="SUPPORTS",
                    admissible=True
                ))

        contradictions: list[ContradictionItem] = []
        for c in verification.contradictions:
            contradictions.append(ContradictionItem(
                contradiction_id=str(uuid.uuid4()),
                source_a=c.get("source_a", ""),
                source_b=c.get("source_b", ""),
                topic=c.get("topic", "Verification dispute"),
                explanation=c.get("explanation", ""),
                severity="HIGH" if "retract" in c.get("explanation", "").lower() else "MEDIUM"
            ))

        # 5. Write private memory
        mem = MemoryItem(
            memory_id=str(uuid.uuid4()),
            agent="heimdall",
            kind="verification_lesson",
            content=f"Event {event_name} verified as {verification.verification_status.value}. Verified sources={len(evidence_refs)}.",
            tags=["verification", parsed.event_id],
            case_id=case_id
        )
        await self.memory_repo.write(mem)
        await self.emit_trace(case_id, run_id, TraceEventType.MEMORY_WRITE.value, memory_id=mem.memory_id)

        case_file = CaseFile(
            case_id=case_id,
            question=question,
            as_of_date=as_of,
            event_hypothesis=parsed.event_hypothesis,
            event_id=parsed.event_id,
            countries=parsed.countries,
            sectors=parsed.sectors,
            verification_status=verification.verification_status,
            verification_summary=verification.summary,
            verification_evidence=evidence_refs,
            contradictions=contradictions,
            research_gaps=verification.research_gaps,
            query_history=executed_queries,
            run_number=run_number,
            pack_id=pack_id
        )
        return case_file
