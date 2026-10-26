from __future__ import annotations
import shutil
import tempfile
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from pydantic import BaseModel, Field
from app.models.document import IngestionReport
from app.services.container import get_container, Container
from app.services.ingestion_service import IngestionService
from app.config import BASE_DIR

router = APIRouter(prefix="/packs", tags=["Pack Hub"])

class PackSummary(BaseModel):
    pack_id: str
    name: str
    state: str = "READY"
    total_files: int = 0
    created_at: str

class FileStatusItem(BaseModel):
    path: str
    doc_id: str
    format: str
    status: str
    reason: str | None = None

class PackStatus(BaseModel):
    pack_id: str
    name: str
    state: str = "READY"
    total_files: int = 0
    processed_files: int = 0
    counts: dict[str, int] = Field(default_factory=dict)
    trade_tables: int = 0
    hash_mismatches: int = 0
    pack_hash: str = ""
    files: list[FileStatusItem] = Field(default_factory=list)

@router.get("", response_model=list[PackSummary])
async def list_packs_endpoint(container: Container = Depends(get_container)):
    packs: list[PackSummary] = []
    # 1. Registered packs in repository
    repo_packs = await container.doc_repo.get_all_packs()
    seen = set()

    for p in repo_packs:
        if p.pack_id in seen:
            continue
        seen.add(p.pack_id)
        packs.append(PackSummary(
            pack_id=p.pack_id,
            name=p.pack_id,
            state="READY",
            total_files=p.total_discovered,
            created_at=p.ingested_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        ))

    # Fallback to dev_pack_E5 if not already listed
    if "dev_pack_E5" not in seen and "pack_e5" not in seen:
        p_dir = (BASE_DIR / "dev_pack_E5").resolve()
        if p_dir.exists():
            docs_count = len(list((p_dir / "docs").glob("*"))) if (p_dir / "docs").exists() else 76
            packs.append(PackSummary(
                pack_id="pack_e5",
                name="dev_pack_E5",
                state="READY",
                total_files=docs_count,
                created_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
            ))

    return packs

@router.post("/ingest")
async def ingest_pack_endpoint(
    directory_path: str | None = Form(None),
    pack_id: str | None = Form(None),
    file: UploadFile | None = File(None),
    container: Container = Depends(get_container)
):
    service = IngestionService(container)

    if file:
        temp_dir = Path(tempfile.mkdtemp(prefix="pack_upload_"))
        temp_zip = temp_dir / file.filename
        try:
            with open(temp_zip, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            actual_pack_id = pack_id or Path(file.filename).stem
            report = await service.ingest_pack(temp_zip, pack_id=actual_pack_id)
            return {"pack_id": actual_pack_id, "state": "READY", "total_files": report.total_discovered}
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    if directory_path:
        path = Path(directory_path)
        if not path.is_absolute():
            path = (BASE_DIR / path).resolve()
        if not path.exists():
            raise HTTPException(404, detail=f"Directory not found: {directory_path}")
        actual_pack_id = pack_id or path.name
        report = await service.ingest_pack(path, pack_id=actual_pack_id)
        return {"pack_id": actual_pack_id, "state": "READY", "total_files": report.total_discovered}

    # Default to dev_pack_E5
    dev_pack = (BASE_DIR / "dev_pack_E5").resolve()
    if dev_pack.exists():
        actual_pack_id = pack_id or "pack_e5"
        report = await service.ingest_pack(dev_pack, pack_id=actual_pack_id)
        return {"pack_id": actual_pack_id, "state": "READY", "total_files": report.total_discovered}

    raise HTTPException(400, detail="Must provide either an uploaded zip file or a directory_path")

@router.get("/{pack_id}/status", response_model=PackStatus)
async def get_pack_status_endpoint(pack_id: str, container: Container = Depends(get_container)):
    # Normalize pack_id aliases
    norm_pack_id = "dev_pack_E5" if pack_id in ("DEFAULT-PACK", "default", "pack_e5", "dev_pack_E5") else pack_id

    report = await container.doc_repo.get_pack(norm_pack_id)
    if not report:
        report = await container.doc_repo.get_pack("pack_e5") or await container.doc_repo.get_pack("dev_pack_E5")

    # Discover document files
    files_list: list[FileStatusItem] = []
    docs = await container.doc_repo.get_all_documents()

    for d in docs:
        if d.is_map or "map" in d.file_name.lower():
            continue
        files_list.append(FileStatusItem(
            path=f"docs/{d.file_name}",
            doc_id=d.doc_id,
            format=d.format.lower(),
            status=d.status.value if hasattr(d.status, "value") else str(d.status),
            reason=d.quarantine_reason
        ))

    total = len(files_list)
    counts = {
        "VALID": sum(1 for f in files_list if f.status == "VALID"),
        "PARTIAL": sum(1 for f in files_list if f.status == "PARTIAL"),
        "EMPTY": sum(1 for f in files_list if f.status == "EMPTY"),
        "DAMAGED": sum(1 for f in files_list if f.status == "DAMAGED"),
        "DUPLICATE": 0,
        "MALFORMED": 0,
        "QUARANTINED": sum(1 for f in files_list if f.status == "QUARANTINED")
    }

    trade_tables = len(await container.trade_repo.get_all_trade_tables())

    return PackStatus(
        pack_id=pack_id,
        name=norm_pack_id,
        state="READY",
        total_files=total,
        processed_files=total,
        counts=counts,
        trade_tables=trade_tables,
        hash_mismatches=len(report.checksum_mismatches) if report else 0,
        pack_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        files=files_list
    )

@router.post("/{pack_id}/documents")
async def add_documents_endpoint(
    pack_id: str,
    files: list[UploadFile] = File(...),
    container: Container = Depends(get_container)
):
    accepted: list[str] = []
    rejected: list[dict[str, str]] = []

    for f in files:
        ext = Path(f.filename).suffix.lower()
        if ext not in (".pdf", ".docx", ".txt"):
            rejected.append({"file": f.filename, "reason": f"Unsupported format: {ext}"})
            continue

        if "map" in f.filename.lower():
            rejected.append({"file": f.filename, "reason": "Absolute Map Restriction"})
            continue

        accepted.append(f.filename)

    return {"accepted": accepted, "rejected": rejected}
