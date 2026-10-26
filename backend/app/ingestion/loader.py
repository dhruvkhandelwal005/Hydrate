from __future__ import annotations
import json
import logging
import shutil
import zipfile
from pathlib import Path
from typing import Any
from app.models.document import DocumentMeta, DocumentStatus, IngestionReport
from app.models.trade import TradeTable
from app.ingestion.sanitizer import is_restricted_map, inspect_for_hostile_content
from app.ingestion.txt_parser import parse_txt_file
from app.ingestion.docx_parser import parse_docx_file
from app.ingestion.pdf_parser import parse_pdf_file
from app.ingestion.metadata_parser import parse_metadata_header
from app.ingestion.trade_parser import parse_trade_content
from app.ingestion.validator import evaluate_document_status
from app.ingestion.chunker import chunk_document
from app.ingestion.embedding import get_embedder, EmbeddingProvider
from app.ingestion.deduplicator import DocumentDeduplicator
from app.utils.hashing import compute_sha256_file, parse_hashes_sha256
from app.utils.text import normalize_text
from app.repositories.documents import FirestoreDocumentRepository
from app.repositories.trade import FirestoreTradeRepository

log = logging.getLogger("ragnarok.ingestion")

class PackLoader:
    def __init__(
        self,
        doc_repo: FirestoreDocumentRepository | None = None,
        trade_repo: FirestoreTradeRepository | None = None,
        embedder: EmbeddingProvider | None = None
    ):
        self.doc_repo = doc_repo
        self.trade_repo = trade_repo
        self.embedder = embedder or get_embedder()
        self.deduplicator = DocumentDeduplicator()

    async def ingest_pack(self, pack_source: Path | str, pack_id: str | None = None) -> IngestionReport:
        source_path = Path(pack_source)
        if not source_path.exists():
            raise FileNotFoundError(f"Pack path does not exist: {source_path}")

        extracted_dir: Path | None = None
        if source_path.is_file():
            if source_path.suffix.lower() == ".zip":
                extracted_dir = source_path.parent / f"_extracted_{source_path.stem}"
                extracted_dir.mkdir(parents=True, exist_ok=True)
                with zipfile.ZipFile(source_path, "r") as z:
                    z.extractall(extracted_dir)
                work_dir = extracted_dir
            else:
                doc_dir = source_path.parent / f"_single_doc_{source_path.stem}"
                doc_dir.mkdir(parents=True, exist_ok=True)
                target_copy = doc_dir / source_path.name
                shutil.copy2(source_path, target_copy)
                work_dir = doc_dir
        else:
            work_dir = source_path

        report = await self._process_directory(work_dir, pack_id or work_dir.name)
        return report

    async def _process_directory(self, root_dir: Path, pack_id: str) -> IngestionReport:
        log.info("Starting generic ingestion for pack=%s from %s", pack_id, root_dir)

        # 1. Discover manifest and checksum files
        manifest_data: dict[str, Any] = {}
        manifest_files = list(root_dir.glob("**/manifest.json"))
        if manifest_files:
            try:
                manifest_data = json.loads(manifest_files[0].read_text(encoding="utf-8"))
                if not pack_id or pack_id.startswith("_extracted_"):
                    pack_id = manifest_data.get("pack", pack_id)
            except Exception as e:
                log.warning("Failed to parse manifest.json: %s", e)

        manifest_docs: dict[str, dict[str, Any]] = {}
        for entry in manifest_data.get("documents", []):
            f_name = entry.get("file") or entry.get("DOC_ID")
            if f_name:
                manifest_docs[Path(f_name).name] = entry

        # 2. Checksum verification
        expected_hashes: dict[str, str] = {}
        hash_files = list(root_dir.glob("**/hashes.sha256"))
        if hash_files:
            try:
                expected_hashes = parse_hashes_sha256(hash_files[0].read_text(encoding="utf-8"))
            except Exception as e:
                log.warning("Failed to parse hashes.sha256: %s", e)

        # 3. Discover all candidate files
        all_files: list[Path] = []
        for p in root_dir.rglob("*"):
            if p.is_file() and p.name not in ("manifest.json", "hashes.sha256", "sample_question.txt"):
                all_files.append(p)

        report = IngestionReport(pack_id=pack_id, total_discovered=len(all_files))

        for file_path in all_files:
            file_name = file_path.name

            # Check checksum if available
            actual_hash = compute_sha256_file(file_path)
            if file_name in expected_hashes:
                if actual_hash.lower() != expected_hashes[file_name].lower():
                    report.checksum_mismatches.append(file_name)
                    log.warning("Checksum mismatch for %s: expected %s, got %s", file_name, expected_hashes[file_name], actual_hash)

            # MAP RESTRICTION: Section 6
            if is_restricted_map(file_path):
                report.map_files_quarantined.append(file_name)
                report.total_quarantined += 1
                report.quarantined_files.append({
                    "file": file_name,
                    "reason": "Absolute Map Restriction: map file excluded from intelligence processing"
                })
                # Quarantine in repo if available
                if self.doc_repo:
                    meta = DocumentMeta(
                        doc_id=file_path.stem,
                        pack_id=pack_id,
                        file_name=file_name,
                        file_path=str(file_path),
                        sha256_hash=actual_hash,
                        status=DocumentStatus.QUARANTINED,
                        quarantine_reason="Absolute Map Restriction",
                        is_map=True,
                        pub_date=parse_metadata_header("", None)["pub_date"]
                    )
                    await self.doc_repo.save_document(meta)
                continue

            # Parse content based on format
            ext = file_path.suffix.lower()
            raw_text = ""
            parse_error: str | None = None
            extracted_tables: list[list[str]] = []

            if ext == ".txt":
                raw_text, _, parse_error = parse_txt_file(file_path)
            elif ext == ".docx":
                raw_text, extracted_tables, parse_error = parse_docx_file(file_path)
            elif ext == ".pdf":
                raw_text, _, parse_error = parse_pdf_file(file_path)
            else:
                # Unsupported format
                report.total_quarantined += 1
                report.quarantined_files.append({
                    "file": file_name,
                    "reason": f"Unsupported format extension: {ext}"
                })
                continue

            report.total_parsed += 1
            raw_size = file_path.stat().st_size
            normalized = normalize_text(raw_text)

            # Deduplication
            is_dup, orig_doc_id = self.deduplicator.check_and_register(file_path.stem, normalized)
            if is_dup:
                report.total_duplicates += 1

            # Validate status
            status, q_reason, usable_summary = evaluate_document_status(
                raw_size=raw_size,
                extracted_text=normalized,
                parse_error=parse_error,
                is_map=False,
                is_duplicate=is_dup
            )

            if status == DocumentStatus.VALID:
                report.total_valid += 1
            elif status == DocumentStatus.PARTIAL:
                report.total_partial += 1
            elif status == DocumentStatus.EMPTY:
                report.total_empty += 1
                report.quarantined_files.append({"file": file_name, "reason": q_reason or "Empty file"})
            elif status == DocumentStatus.DAMAGED:
                report.total_damaged += 1
                report.quarantined_files.append({"file": file_name, "reason": q_reason or "Damaged file"})
            elif status == DocumentStatus.QUARANTINED:
                report.total_quarantined += 1
                report.quarantined_files.append({"file": file_name, "reason": q_reason or "Quarantined"})

            # Parse metadata
            manifest_entry = manifest_docs.get(file_name)
            meta_dict = parse_metadata_header(normalized, manifest_entry)
            doc_id = meta_dict["doc_id"] or file_path.stem

            # Prompt injection check
            injection_flags = inspect_for_hostile_content(normalized)

            # Trade table parsing
            trade_table = None
            if status in (DocumentStatus.VALID, DocumentStatus.PARTIAL):
                trade_table = parse_trade_content(
                    doc_id=doc_id,
                    text=normalized,
                    default_origin=meta_dict.get("country") or "",
                    default_dest="",
                    default_sector=meta_dict.get("sector") or ""
                )
                if trade_table and trade_table.rows:
                    report.total_trade_tables += 1
                    report.total_trade_rows += len(trade_table.rows)
                    if self.trade_repo:
                        await self.trade_repo.save_trade_table(trade_table)

            # Chunking and embedding
            chunks = []
            doc_emb: list[float] = []
            if status in (DocumentStatus.VALID, DocumentStatus.PARTIAL) and normalized:
                chunks = chunk_document(doc_id, normalized)
                doc_emb = await self.embedder.embed(normalized[:4000])

            doc_meta = DocumentMeta(
                doc_id=doc_id,
                pack_id=pack_id,
                event_id=meta_dict.get("event_id", "NONE"),
                title=meta_dict.get("title", ""),
                source_name=meta_dict.get("source_name", ""),
                source_type=meta_dict.get("source_type", ""),
                reliability=meta_dict.get("reliability"),
                pub_date=meta_dict.get("pub_date"),
                pub_time=meta_dict.get("pub_time"),
                country=meta_dict.get("country"),
                sector=meta_dict.get("sector"),
                language=meta_dict.get("language", "en"),
                format=meta_dict.get("format", ext.lstrip(".").upper()),
                file_name=file_name,
                file_path=str(file_path),
                sha256_hash=actual_hash,
                status=status,
                quarantine_reason=q_reason,
                usable_portion_summary=usable_summary,
                has_trade_tables=bool(trade_table and trade_table.rows),
                prompt_injection_flags=injection_flags,
                is_map=False,
                text=normalized,
                chunks=chunks,
                embedding=doc_emb
            )

            if self.doc_repo:
                await self.doc_repo.save_document(doc_meta)

        if self.doc_repo:
            await self.doc_repo.save_pack(report)

        log.info(
            "Ingestion finished for %s: total=%d valid=%d partial=%d empty=%d damaged=%d map_quarantined=%d trade_rows=%d",
            pack_id, report.total_discovered, report.total_valid, report.total_partial,
            report.total_empty, report.total_damaged, len(report.map_files_quarantined), report.total_trade_rows
        )
        return report
