from __future__ import annotations
from typing import Any
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from app.models.trade import TradeRow, TradeTable
from app.repositories.firebase import fs_retry

class FirestoreTradeRepository:
    def __init__(self, db: firestore.Client | None = None):
        self.db = db
        self._tables: dict[str, TradeTable] = {}
        self._rows: dict[str, dict[str, TradeRow]] = {}

    async def save_trade_table(self, table: TradeTable) -> None:
        self._tables[table.table_id] = table
        if table.table_id not in self._rows:
            self._rows[table.table_id] = {}
        for row in table.rows:
            self._rows[table.table_id][row.row_id] = row

        if self.db is not None:
            data = table.model_dump(mode="json")
            await fs_retry(lambda: self.db.collection("trade_tables").document(table.table_id).set(data, merge=True))
            for row in table.rows:
                await self.save_trade_row(row)

    async def save_trade_row(self, row: TradeRow) -> None:
        if row.table_id not in self._rows:
            self._rows[row.table_id] = {}
        self._rows[row.table_id][row.row_id] = row

        if self.db is not None:
            data = row.model_dump(mode="json")
            ref = self.db.collection("trade_tables").document(row.table_id).collection("rows").document(row.row_id)
            await fs_retry(lambda: ref.set(data, merge=True))

    async def get_trade_table(self, table_id: str) -> TradeTable | None:
        if table_id in self._tables:
            return self._tables[table_id]
        if self.db is not None:
            snap = await fs_retry(lambda: self.db.collection("trade_tables").document(table_id).get())
            if snap and snap.exists:
                table = TradeTable.model_validate(snap.to_dict())
                self._tables[table_id] = table
                return table
        return None

    async def get_all_trade_tables(self) -> list[TradeTable]:
        return list(self._tables.values())

    async def get_trade_row(self, table_id: str, row_id: str) -> TradeRow | None:
        if table_id in self._rows and row_id in self._rows[table_id]:
            return self._rows[table_id][row_id]
        # Also check without prefix if row_id is int or string
        if table_id in self._rows:
            for rid, r in self._rows[table_id].items():
                if rid == row_id or rid.lstrip("R") == str(row_id) or str(r.row_id) == str(row_id):
                    return r

        if self.db is not None:
            ref = self.db.collection("trade_tables").document(table_id).collection("rows").document(row_id)
            snap = await fs_retry(lambda: ref.get())
            if snap and snap.exists:
                row = TradeRow.model_validate(snap.to_dict())
                if table_id not in self._rows:
                    self._rows[table_id] = {}
                self._rows[table_id][row.row_id] = row
                return row
        return None

    async def query_trade_rows(
        self,
        origin: str | None = None,
        destination: str | None = None,
        sector: str | None = None,
        year: int | None = None
    ) -> list[TradeRow]:
        results: list[TradeRow] = []
        for table_rows in self._rows.values():
            for r in table_rows.values():
                if origin and r.origin.lower() != origin.lower():
                    continue
                if destination and r.destination.lower() != destination.lower():
                    continue
                if sector and r.sector.lower() != sector.lower():
                    continue
                if year and r.year != year:
                    continue
                results.append(r)

        if results:
            return results

        if self.db is not None:
            try:
                q = self.db.collection_group("rows")
                if origin:
                    q = q.where(filter=FieldFilter("origin", "==", origin))
                if destination:
                    q = q.where(filter=FieldFilter("destination", "==", destination))
                if sector:
                    q = q.where(filter=FieldFilter("sector", "==", sector))
                snaps = await fs_retry(lambda: list(q.limit(200).stream()))
                if snaps:
                    return [TradeRow.model_validate(s.to_dict()) for s in snaps]
            except Exception:
                pass
        return results
