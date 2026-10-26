from __future__ import annotations
import os
from pathlib import Path
from datetime import date
from typing import Any
from fastapi import APIRouter, HTTPException, Depends, Query, Response
from fastapi.responses import FileResponse, PlainTextResponse
from app.models.document import DocumentMeta, ReliabilityTier
from app.models.trade import TradeRow, TradeTable
from app.services.container import get_container, Container
from app.services.source_service import SourceService
from app.config import BASE_DIR

router = APIRouter(tags=["Sources & Trade"])

@router.get("/sources")
async def search_sources_endpoint(
    event_id: str | None = Query(None),
    country: str | None = Query(None),
    sector: str | None = Query(None),
    tier: str | None = Query(None),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    q: str | None = Query(None),
    container: Container = Depends(get_container)
):
    docs = await container.doc_repo.get_all_documents()
    filtered = []

    for d in docs:
        if d.is_map:
            continue
        if event_id and d.event_id and d.event_id.upper() not in (event_id.upper(), "NONE", "BACKGROUND"):
            continue
        if country and d.country and d.country.lower() != country.lower():
            continue
        if sector and d.sector and d.sector.lower() != sector.lower():
            continue
        if tier:
            t_str = str(d.reliability.value if hasattr(d.reliability, "value") else d.reliability)
            if t_str != tier:
                continue
        if from_date and d.pub_date and d.pub_date < date.fromisoformat(from_date):
            continue
        if to_date and d.pub_date and d.pub_date > date.fromisoformat(to_date):
            continue
        if q and q.lower() not in (d.title.lower() + " " + d.text[:1000].lower()):
            continue

        rel_int = 2
        try:
            rel_int = int(d.reliability.value if hasattr(d.reliability, "value") else d.reliability)
        except Exception:
            rel_int = 2

        filtered.append({
            "doc_id": d.doc_id,
            "title": d.title,
            "source_name": d.source_name,
            "tier": rel_int,
            "pub_date": d.pub_date.isoformat() if d.pub_date else "2027-01-25",
            "pub_time": d.pub_time or "10:00",
            "country": d.country,
            "sector": d.sector,
            "source_type": d.source_type,
            "admissible": d.status.value == "VALID" if hasattr(d.status, "value") else str(d.status) == "VALID",
            "file_url": f"/api/v1/sources/{d.doc_id}/file",
            "flags": ["retracted"] if "retract" in d.text.lower() else []
        })

    return filtered

@router.get("/sources/{doc_id}")
async def get_source_endpoint(
    doc_id: str,
    as_of: str | None = Query(None),
    container: Container = Depends(get_container)
):
    service = SourceService(container)
    doc = await service.get_source(doc_id)
    if not doc:
        # Check by file_name or stem
        for d in await container.doc_repo.get_all_documents():
            if d.doc_id == doc_id or Path(d.file_name).stem == doc_id:
                doc = d
                break

    if not doc:
        raise HTTPException(404, detail=f"Source document {doc_id} not found")

    # Hard Simulated Clock Firewall check
    if as_of and doc.pub_date:
        try:
            cutoff = date.fromisoformat(as_of)
            if doc.pub_date > cutoff:
                raise HTTPException(403, detail=f"CLOCK_VIOLATION: Document {doc_id} published on {doc.pub_date} after as-of date {cutoff}")
        except ValueError:
            pass

    rel_int = 2
    try:
        rel_int = int(doc.reliability.value if hasattr(doc.reliability, "value") else doc.reliability)
    except Exception:
        rel_int = 2

    text = doc.text
    # Mask prompt injection if suspected
    injection_suspected = bool(doc.prompt_injection_flags)
    if injection_suspected:
        for flag in doc.prompt_injection_flags:
            text = text.replace(flag, "[FLAGGED_INJECTION_MASKED]")

    flags = {
        "retracted": "retract" in doc.text.lower() or "withdrawn" in doc.text.lower(),
        "corrected_by": None,
        "injection_suspected": injection_suspected,
        "partial": doc.status.value == "PARTIAL" if hasattr(doc.status, "value") else str(doc.status) == "PARTIAL",
        "duplicate_of": None
    }

    spans = [
        {"id": "s1", "start": 0, "end": min(len(text), 200), "claim_ids": []}
    ]

    return {
        "doc_id": doc.doc_id,
        "title": doc.title,
        "file_name": doc.file_name,
        "format": doc.format.lower(),
        "source_name": doc.source_name,
        "source_type": doc.source_type,
        "tier": rel_int,
        "pub_date": doc.pub_date.isoformat() if doc.pub_date else "2027-01-25",
        "pub_time": doc.pub_time or "09:00",
        "country": doc.country,
        "sector": doc.sector,
        "event_id": doc.event_id,
        "language": doc.language,
        "flags": flags,
        "text": text,
        "file_url": f"/api/v1/sources/{doc.doc_id}/file",
        "spans": spans
    }

@router.get("/sources/{doc_id}/file")
@router.get("/sources/{doc_id}/pdf")
@router.get("/sources/{doc_id}/raw")
async def get_source_file_endpoint(
    doc_id: str,
    as_of: str | None = Query(None),
    container: Container = Depends(get_container)
):
    """
    Opens/downloads the exact raw document (PDF, TXT, DOCX) directly inline.
    Ensures that when a user clicks on any claim, the exact PDF file opens in browser!
    """
    doc = await container.doc_repo.get_document(doc_id)
    file_path: Path | None = None

    if doc and doc.file_path and Path(doc.file_path).exists():
        file_path = Path(doc.file_path)
    else:
        # Search in dev_pack_E5/docs
        pack_docs = (BASE_DIR / "dev_pack_E5" / "docs").resolve()
        for p in pack_docs.glob(f"{doc_id}.*"):
            if p.is_file():
                file_path = p
                break
        if not file_path:
            for p in pack_docs.glob("*"):
                if p.stem == doc_id:
                    file_path = p
                    break

    if not file_path or not file_path.exists():
        # If file on disk is missing, generate text response
        if doc:
            return PlainTextResponse(doc.text, media_type="text/plain; charset=utf-8")
        raise HTTPException(404, detail=f"File for document {doc_id} not found")

    ext = file_path.suffix.lower()
    if ext == ".pdf":
        return FileResponse(
            str(file_path),
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename={file_path.name}"}
        )
    elif ext == ".docx":
        return FileResponse(
            str(file_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"inline; filename={file_path.name}"}
        )
    else:
        return FileResponse(
            str(file_path),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f"inline; filename={file_path.name}"}
        )

@router.get("/trade/{table_id}")
async def get_trade_table_endpoint(table_id: str, container: Container = Depends(get_container)):
    table = await container.trade_repo.get_trade_table(table_id)
    if not table:
        # Try table_id by stem
        for t in await container.trade_repo.get_all_trade_tables():
            if t.table_id == table_id or t.source_id == table_id:
                table = t
                break

    if not table:
        raise HTTPException(404, detail=f"Trade table {table_id} not found")

    rows_data = []
    for r in table.rows:
        rows_data.append({
            "row": int(r.row_id.lstrip("R")) if r.row_id.lstrip("R").isdigit() else r.row_id,
            "period": r.period,
            "value_usd_m": r.value_usd_m,
            "volume_tonnes": r.volume_tonnes,
            "status": r.status.value if hasattr(r.status, "value") else str(r.status),
            "reason": r.validation_error
        })

    return {
        "table_id": table.table_id,
        "source_id": table.source_id,
        "title": table.title,
        "origin": table.origin,
        "destination": table.destination,
        "sector": table.sector,
        "has_anomalies": table.has_anomalies,
        "anomalies": table.anomalies,
        "rows": rows_data
    }

@router.get("/trade/{table_id}/rows/{row_id}")
async def get_trade_row_endpoint(table_id: str, row_id: str, container: Container = Depends(get_container)):
    row = await container.trade_repo.get_trade_row(table_id, row_id)
    if not row:
        raise HTTPException(404, detail=f"Trade row {row_id} in table {table_id} not found")

    row_num = int(row.row_id.lstrip("R")) if row.row_id.lstrip("R").isdigit() else row.row_id

    return {
        "table_id": table_id,
        "row": row_num,
        "header": {
            "country_pair": f"{row.origin} to {row.destination}",
            "sector": row.sector,
            "unit": "USD_M",
            "period": row.period,
            "event_id": row.event_id
        },
        "columns": ["row", "month", "value", "volume"],
        "values": [row_num, row.period, row.value_usd_m, row.volume_tonnes],
        "status": row.status.value if hasattr(row.status, "value") else str(row.status),
        "reason": row.validation_error
    }
