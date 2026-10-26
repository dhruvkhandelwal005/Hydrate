from __future__ import annotations
import json
import logging
from datetime import date
from pathlib import Path
from app.config import settings, BASE_DIR
from app.repositories.firebase import get_firestore_client
from app.repositories.cases import FirestoreCaseRepository
from app.repositories.documents import FirestoreDocumentRepository
from app.repositories.trade import FirestoreTradeRepository
from app.repositories.memories import FirestoreAgentMemoryRepository
from app.repositories.traces import FirestoreTraceRepository
from app.models.document import DocumentMeta, DocumentStatus, IngestionReport, ReliabilityTier
from app.models.trade import TradeTable, TradeRow, TradeRowStatus
from app.observability.tracing import MultiTraceSink
from app.ingestion.embedding import get_embedder
from app.ingestion.loader import PackLoader
from app.ingestion.metadata_parser import parse_metadata_header
from app.ingestion.trade_parser import parse_trade_content
from app.ingestion.sanitizer import is_restricted_map, inspect_for_hostile_content
from app.ingestion.txt_parser import parse_txt_file
from app.ingestion.docx_parser import parse_docx_file
from app.ingestion.pdf_parser import parse_pdf_file
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
        self.search_tool = FirestoreHybridSearch(self.db, self.embedder, self.trace_sink, doc_repo=self.doc_repo)
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

        # Fast sync bootstrap of dev_pack_E5 if not already loaded
        self._bootstrap_default_pack()

    def _bootstrap_default_pack(self) -> None:
        try:
            pack_dir = (BASE_DIR / "dev_pack_E5").resolve()
            if not pack_dir.exists() or len(self.doc_repo._docs) > 0:
                return

            manifest_path = pack_dir / "manifest.json"
            if not manifest_path.exists():
                return

            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            pack_id = manifest.get("pack", "dev_pack_E5")
            docs_dir = pack_dir / "docs"

            valid_count = 0
            partial_count = 0
            empty_count = 0
            damaged_count = 0
            duplicate_count = 0
            trade_count = 0
            quarantined_files = []

            for entry in manifest.get("documents", []):
                file_name = entry.get("file")
                doc_id = entry.get("DOC_ID") or Path(file_name).stem
                file_path = docs_dir / file_name

                if not file_path.exists():
                    continue

                if is_restricted_map(file_path):
                    quarantined_files.append({"file": file_name, "reason": "Absolute Map Restriction"})
                    continue

                ext = file_path.suffix.lower()
                text = ""
                tables = []
                err = None

                if ext == ".txt":
                    text, _, err = parse_txt_file(file_path)
                elif ext == ".docx":
                    text, tables, err = parse_docx_file(file_path)
                elif ext == ".pdf":
                    text, _, err = parse_pdf_file(file_path)

                raw_size = file_path.stat().st_size
                if raw_size == 0 or not text.strip():
                    status = DocumentStatus.EMPTY
                    empty_count += 1
                elif err:
                    status = DocumentStatus.DAMAGED
                    damaged_count += 1
                else:
                    status = DocumentStatus.VALID
                    valid_count += 1

                # Parse pub date
                pub_d = None
                if entry.get("PUB_DATE"):
                    try:
                        pub_d = date.fromisoformat(str(entry.get("PUB_DATE"))[:10])
                    except Exception:
                        pass

                # Parse reliability
                rel_str = str(entry.get("RELIABILITY", "UNKNOWN"))
                try:
                    rel_tier = ReliabilityTier(rel_str)
                except Exception:
                    rel_tier = ReliabilityTier.UNKNOWN

                # Trade tables parsing
                trade_table = None
                if status == DocumentStatus.VALID and ("Trade note" in text or "Trade Table" in text or "trade" in text.lower()):
                    trade_table = parse_trade_content(
                        doc_id=doc_id,
                        text=text,
                        default_origin=entry.get("COUNTRY") or "",
                        default_dest="",
                        default_sector=entry.get("SECTOR") or ""
                    )
                    if trade_table and trade_table.rows:
                        trade_count += 1
                        self.trade_repo._tables[trade_table.table_id] = trade_table
                        if trade_table.table_id not in self.trade_repo._rows:
                            self.trade_repo._rows[trade_table.table_id] = {}
                        for r in trade_table.rows:
                            self.trade_repo._rows[trade_table.table_id][r.row_id] = r

                doc_meta = DocumentMeta(
                    doc_id=doc_id,
                    pack_id=pack_id,
                    event_id=entry.get("EVENT_ID", "NONE"),
                    title=entry.get("TITLE", ""),
                    source_name=entry.get("SOURCE_NAME", ""),
                    source_type=entry.get("SOURCE_TYPE", ""),
                    reliability=rel_tier,
                    pub_date=pub_d,
                    pub_time=entry.get("PUB_TIME"),
                    country=entry.get("COUNTRY"),
                    sector=entry.get("SECTOR"),
                    language=entry.get("LANGUAGE", "en"),
                    format=entry.get("FORMAT", ext.lstrip(".").upper()),
                    file_name=file_name,
                    file_path=str(file_path),
                    status=status,
                    text=text,
                    has_trade_tables=bool(trade_table and trade_table.rows)
                )
                self.doc_repo._docs[doc_id] = doc_meta

            report = IngestionReport(
                pack_id=pack_id,
                total_discovered=len(self.doc_repo._docs) + len(quarantined_files),
                total_parsed=len(self.doc_repo._docs),
                total_valid=valid_count,
                total_partial=partial_count,
                total_empty=empty_count,
                total_damaged=damaged_count,
                total_duplicates=duplicate_count,
                total_quarantined=len(quarantined_files),
                total_trade_tables=trade_count,
                total_trade_rows=sum(len(t.rows) for t in self.trade_repo._tables.values()),
                quarantined_files=quarantined_files,
                map_files_quarantined=["runemark_map.png"]
            )
            self.doc_repo._packs[pack_id] = report
            # Also register alias pack_e5
            self.doc_repo._packs["pack_e5"] = report
            log.info("Auto-bootstrapped pack %s with %d docs and %d trade tables.", pack_id, len(self.doc_repo._docs), trade_count)
        except Exception as e:
            log.warning("Notice in default pack bootstrap: %s", e)

_container: Container | None = None

def get_container() -> Container:
    global _container
    if _container is None:
        _container = Container()
    return _container
