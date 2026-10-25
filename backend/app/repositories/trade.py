from __future__ import annotations
from typing import Any
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from app.models.trade import TradeRow, TradeTable
from app.repositories.firebase import fs_retry

class FirestoreTradeRepository:
    def __init__(self, db: firestore.Client):
        self.db = db

    async def save_trade_table(self, table: TradeTable) -> None:
        data = table.model_dump(mode="json")
        await fs_retry(lambda: self.db.collection("trade_tables").document(table.table_id).set(data, merge=True))
        for row in table.rows:
            await self.save_trade_row(row)

    async def save_trade_row(self, row: TradeRow) -> None:
        data = row.model_dump(mode="json")
        ref = self.db.collection("trade_tables").document(row.table_id).collection("rows").document(row.row_id)
        await fs_retry(lambda: ref.set(data, merge=True))

    async def get_trade_row(self, table_id: str, row_id: str) -> TradeRow | None:
        ref = self.db.collection("trade_tables").document(table_id).collection("rows").document(row_id)
        snap = await fs_retry(lambda: ref.get())
        if not snap.exists:
            return None
        return TradeRow.model_validate(snap.to_dict())

    async def query_trade_rows(
        self,
        origin: str | None = None,
        destination: str | None = None,
        sector: str | None = None,
        year: int | None = None
    ) -> list[TradeRow]:
        # Query collection group or table rows
        q = self.db.collection_group("rows")
        if origin:
            q = q.where(filter=FieldFilter("origin", "==", origin))
        if destination:
            q = q.where(filter=FieldFilter("destination", "==", destination))
        if sector:
            q = q.where(filter=FieldFilter("sector", "==", sector))
        if year:
            q = q.where(filter=FieldFilter("year", "==", year))

        snaps = await fs_retry(lambda: list(q.limit(200).stream()))
        return [TradeRow.model_validate(s.to_dict()) for s in snaps]
