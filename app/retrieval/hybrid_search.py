from __future__ import annotations
import math
import uuid
import logging
from abc import ABC, abstractmethod
from datetime import date
from typing import Any
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel, ConfigDict, Field
from app.models.document import ReliabilityTier
from app.models.trace import TraceEvent, TraceEventType
from app.retrieval.metadata_filters import SearchFilters
from app.retrieval.lexical_search import compute_lexical_score
from app.retrieval.reranker import score_candidate, get_reliability_weight
from app.ingestion.embedding import EmbeddingProvider, cosine_sim
from app.observability.tracing import TraceSink
from app.repositories.firebase import fs_retry

log = logging.getLogger("ragnarok.retrieval")

class SearchResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    source_id: str
    title: str = ""
    text: str
    pub_date: date
    pub_time: str | None = None
    source_name: str = ""
    source_type: str = ""
    reliability: ReliabilityTier = ReliabilityTier.UNKNOWN
    event_id: str | None = None
    country: str | None = None
    sector: str | None = None
    locator: str = "document"
    lexical_score: float = 0.0
    semantic_score: float = 0.0
    reliability_score: float = 0.0
    final_score: float = 0.0
    status: str = "VALID"
    is_corrected: bool = False

class SearchTool(ABC):
    @abstractmethod
    async def search(self, *, query: str, filters: SearchFilters, limit: int = 10) -> list[SearchResult]: ...

class FirestoreHybridSearch(SearchTool):
    def __init__(self, db: firestore.Client, embedder: EmbeddingProvider, trace_sink: TraceSink | None = None):
        self.db = db
        self.embedder = embedder
        self.trace_sink = trace_sink

    async def search(self, *, query: str, filters: SearchFilters, limit: int = 10) -> list[SearchResult]:
        # Query pack documents from Firestore using single-field query to avoid composite index requirements
        # Then enforce strict Hard Simulated Clock Firewall and metadata filters in Python.
        def _fetch_pack_docs():
            try:
                # Attempt compound query if index exists
                q = self.db.collection("documents").where(filter=FieldFilter("pack_id", "==", filters.pack_id))
                return list(q.limit(max(80, limit * 10)).stream())
            except Exception as e:
                log.warning("Falling back to unconstrained pack stream: %s", e)
                return list(self.db.collection("documents").limit(100).stream())

        docs = await fs_retry(_fetch_pack_docs)

        q_vec = await self.embedder.embed(query)
        candidates: list[SearchResult] = []

        for snap in docs:
            d = snap.to_dict() or {}
            doc_id = str(d.get("doc_id") or snap.id)

            # Check pack_id
            if str(d.get("pack_id")) != filters.pack_id:
                continue

            # Check status: quarantine, map, empty excluded
            status = str(d.get("status", "VALID")).upper()
            if status in ("QUARANTINED", "EMPTY", "DAMAGED") or d.get("is_map"):
                continue

            # HARD SIMULATED CLOCK FIREWALL: Section 9
            try:
                pub = date.fromisoformat(str(d.get("pub_date"))[:10])
                if pub > filters.as_of_date:
                    if self.trace_sink:
                        await self.trace_sink.emit(TraceEvent(
                            trace_id=str(uuid.uuid4()),
                            case_id=filters.pack_id,
                            run_id="retrieval",
                            agent="controller",
                            event_type=TraceEventType.CLOCK_VIOLATION.value,
                            payload={"doc_id": doc_id, "pub_date": str(pub), "as_of": str(filters.as_of_date)}
                        ))
                    continue
            except Exception:
                continue

            # Metadata Filters: Section 12
            if filters.country and d.get("country") and str(d.get("country")).lower() != filters.country.lower():
                # Allow country filter but don't exclude background docs with no country
                if d.get("source_type") != "atlas":
                    continue

            if filters.sector and d.get("sector") and str(d.get("sector")).lower() != filters.sector.lower():
                if d.get("source_type") != "atlas":
                    continue

            if filters.source_type and str(d.get("source_type")).lower() != filters.source_type.lower():
                continue

            if filters.reliability and str(d.get("reliability")).upper() != filters.reliability.upper():
                continue

            if filters.document_id and doc_id != filters.document_id:
                continue

            # Event relevance check: allow event_id match OR NONE/BACKGROUND
            doc_event = str(d.get("event_id") or "NONE").strip().upper()
            if filters.event_id:
                target_ev = filters.event_id.strip().upper()
                if doc_event not in (target_ev, "NONE", "BACKGROUND", ""):
                    continue

            text = str(d.get("text") or "")
            title = str(d.get("title") or "")
            if not text:
                continue

            lexical = compute_lexical_score(query, text, title)
            doc_vec = d.get("embedding") or []
            semantic = cosine_sim(q_vec, doc_vec) if q_vec and doc_vec else 0.0

            exact_entities = 0
            for term in (filters.country, filters.sector, filters.event_id):
                if term and term.lower() in text.lower():
                    exact_entities += 1

            rel_tier = ReliabilityTier(d.get("reliability", ReliabilityTier.UNKNOWN))
            is_corrected = bool(d.get("is_corrected", False))
            final_score = score_candidate(semantic, lexical, rel_tier, exact_entities, is_corrected)

            candidates.append(SearchResult(
                source_id=doc_id,
                title=title,
                text=text,
                pub_date=pub,
                pub_time=d.get("pub_time"),
                source_name=str(d.get("source_name") or ""),
                source_type=str(d.get("source_type") or ""),
                reliability=rel_tier,
                event_id=d.get("event_id"),
                country=d.get("country"),
                sector=d.get("sector"),
                locator=str(d.get("locator") or "document"),
                lexical_score=lexical,
                semantic_score=semantic,
                reliability_score=get_reliability_weight(rel_tier),
                final_score=final_score,
                status=status,
                is_corrected=is_corrected
            ))

        candidates.sort(key=lambda x: x.final_score, reverse=True)
        return candidates[:limit]
