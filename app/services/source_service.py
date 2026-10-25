from __future__ import annotations
from typing import Any
from app.models.document import DocumentMeta
from app.models.trade import TradeRow
from app.services.container import Container

class SourceService:
    def __init__(self, container: Container):
        self.container = container

    async def get_source(self, source_id: str) -> DocumentMeta | None:
        return await self.container.doc_repo.get_document(source_id)

    async def get_trade_row(self, table_id: str, row_id: str) -> TradeRow | None:
        return await self.container.trade_repo.get_trade_row(table_id, row_id)
