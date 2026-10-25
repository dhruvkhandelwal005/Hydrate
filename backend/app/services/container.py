from __future__ import annotations
import logging
from app.config import settings
from app.repositories.firebase import get_firestore_client
from app.repositories.cases import FirestoreCaseRepository
from app.repositories.documents import FirestoreDocumentRepository
from app.repositories.trade import FirestoreTradeRepository
from app.repositories.memories import FirestoreAgentMemoryRepository
from app.repositories.traces import FirestoreTraceRepository
from app.observability.tracing import MultiTraceSink
from app.ingestion.embedding import get_embedder
from app.ingestion.loader import PackLoader
from app.retrieval.hybrid_search import FirestoreHybridSearch
from app.retrieval.query_registry import QueryRegistry
from app.agents.base import get_llm_provider
from app.agents.heimdall import HeimdallAgent
from app.agents.thor import ThorAgent
from app.agents.loki import LokiAgent
from app.agents.odin import OdinAgent
from app.orchestration.trial_engine import TrialEngine
from app.orchestration.limits import TrialLimits

log = logging.getLogger("ragnarok.container")

class Container:
    def __init__(self):
        self.db = get_firestore_client()

        # Repositories
        self.case_repo = FirestoreCaseRepository(self.db)
        self.doc_repo = FirestoreDocumentRepository(self.db)
        self.trade_repo = FirestoreTradeRepository(self.db)
        self.trace_repo = FirestoreTraceRepository(self.db)

        # Isolated Agent Memories (strictly separate namespaces)
        self.heimdall_memory = FirestoreAgentMemoryRepository(self.db, "heimdall")
        self.thor_memory = FirestoreAgentMemoryRepository(self.db, "thor")
        self.loki_memory = FirestoreAgentMemoryRepository(self.db, "loki")
        self.odin_memory = FirestoreAgentMemoryRepository(self.db, "odin")

        # Observability
        self.trace_sink = MultiTraceSink(persistence_sink=self.trace_repo)

        # Embedder & Hybrid Retrieval
        self.embedder = get_embedder()
        self.search_tool = FirestoreHybridSearch(self.db, self.embedder, self.trace_sink)
        self.query_registry = QueryRegistry()

        # Ingestion Loader
        self.loader = PackLoader(self.doc_repo, self.trade_repo, self.embedder)

        # LLM Provider
        self.llm = get_llm_provider()

        # Exactly 4 Reasoning Agents
        self.heimdall = HeimdallAgent(
            llm=self.llm,
            search_tool=self.search_tool,
            memory_repo=self.heimdall_memory,
            trace_sink=self.trace_sink,
            query_registry=self.query_registry
        )
        self.thor = ThorAgent(
            llm=self.llm,
            search_tool=self.search_tool,
            memory_repo=self.thor_memory,
            trace_sink=self.trace_sink,
            query_registry=self.query_registry
        )
        self.loki = LokiAgent(
            llm=self.llm,
            search_tool=self.search_tool,
            memory_repo=self.loki_memory,
            trace_sink=self.trace_sink,
            query_registry=self.query_registry
        )
        self.odin = OdinAgent(
            llm=self.llm,
            search_tool=self.search_tool,
            memory_repo=self.odin_memory,
            trace_sink=self.trace_sink
        )

        # Trial Engine
        self.limits = TrialLimits()
        self.trial_engine = TrialEngine(
            heimdall=self.heimdall,
            thor=self.thor,
            loki=self.loki,
            odin=self.odin,
            case_repo=self.case_repo,
            trade_repo=self.trade_repo,
            doc_repo=self.doc_repo,
            trace_sink=self.trace_sink,
            limits=self.limits
        )

_container: Container | None = None

def get_container() -> Container:
    global _container
    if _container is None:
        _container = Container()
    return _container
