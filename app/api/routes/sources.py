from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends
from app.models.document import DocumentMeta
from app.models.trade import TradeRow
from app.services.container import get_container, Container
from app.services.source_service import SourceService

router = APIRouter(tags=["Sources & Trade"])

@router.get("/sources/{source_id}")
async def get_source_endpoint(source_id: str, container: Container = Depends(get_container)):
    service = SourceService(container)
    doc = await service.get_source(source_id)
    if not doc:
        raise HTTPException(404, f"Source document {source_id} not found")
    return doc.model_dump(mode="json")

@router.get("/trade/{table_id}/rows/{row_id}")
async def get_trade_row_endpoint(table_id: str, row_id: str, container: Container = Depends(get_container)):
    service = SourceService(container)
    row = await service.get_trade_row(table_id, row_id)
    if not row:
        raise HTTPException(404, f"Trade row {row_id} in table {table_id} not found")
    return row.model_dump(mode="json")
