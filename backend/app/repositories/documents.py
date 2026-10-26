from __future__ import annotations
from datetime import date
from typing import Any
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from app.models.document import DocumentMeta, IngestionReport
from app.repositories.firebase import fs_retry

class FirestoreDocumentRepository:
    def __init__(self, db: firestore.Client | None = None):
        self.db = db
        self._docs: dict[str, DocumentMeta] = {}
        self._packs: dict[str, IngestionReport] = {}

    async def save_document(self, doc: DocumentMeta) -> None:
        self._docs[doc.doc_id] = doc
        if self.db is not None:
            data = doc.model_dump(mode="json")
            data["pub_date"] = doc.pub_date.isoformat() if doc.pub_date else None
            data["created_at"] = doc.created_at
            await fs_retry(lambda: self.db.collection("documents").document(doc.doc_id).set(data, merge=True))

    async def get_document(self, doc_id: str) -> DocumentMeta | None:
        if doc_id in self._docs:
            return self._docs[doc_id]
        if self.db is not None:
            snap = await fs_retry(lambda: self.db.collection("documents").document(doc_id).get())
            if snap and snap.exists:
                doc = DocumentMeta.model_validate(snap.to_dict())
                self._docs[doc_id] = doc
                return doc
        return None

    async def get_all_documents(self, pack_id: str | None = None) -> list[DocumentMeta]:
        if pack_id:
            return [d for d in self._docs.values() if d.pack_id == pack_id]
        return list(self._docs.values())

    async def save_pack(self, report: IngestionReport) -> None:
        self._packs[report.pack_id] = report
        if self.db is not None:
            data = report.model_dump(mode="json")
            data["ingested_at"] = report.ingested_at
            await fs_retry(lambda: self.db.collection("packs").document(report.pack_id).set(data, merge=True))

    async def get_pack(self, pack_id: str) -> IngestionReport | None:
        if pack_id in self._packs:
            return self._packs[pack_id]
        if self.db is not None:
            snap = await fs_retry(lambda: self.db.collection("packs").document(pack_id).get())
            if snap and snap.exists:
                rep = IngestionReport.model_validate(snap.to_dict())
                self._packs[pack_id] = rep
                return rep
        return None

    async def get_all_packs(self) -> list[IngestionReport]:
        return list(self._packs.values())

    async def find_documents(
        self,
        pack_id: str,
        as_of_date: date | None = None,
        country: str | None = None,
        sector: str | None = None,
        source_type: str | None = None,
        reliability: str | None = None,
        limit: int = 100
    ) -> list[DocumentMeta]:
        # Fast in-memory filter first
        matching = []
        for d in self._docs.values():
            if d.pack_id != pack_id:
                continue
            if as_of_date and d.pub_date and d.pub_date > as_of_date:
                continue
            if country and d.country and d.country.lower() != country.lower():
                continue
            if sector and d.sector and d.sector.lower() != sector.lower():
                continue
            if source_type and d.source_type and d.source_type.lower() != source_type.lower():
                continue
            if reliability and str(d.reliability) != str(reliability):
                continue
            matching.append(d)
            if len(matching) >= limit:
                break

        if matching:
            return matching

        if self.db is not None:
            try:
                q = self.db.collection("documents").where(filter=FieldFilter("pack_id", "==", pack_id))
                if as_of_date:
                    q = q.where(filter=FieldFilter("pub_date", "<=", as_of_date.isoformat()))
                if country:
                    q = q.where(filter=FieldFilter("country", "==", country))
                if sector:
                    q = q.where(filter=FieldFilter("sector", "==", sector))
                snaps = await fs_retry(lambda: list(q.limit(limit).stream()))
                if snaps:
                    results = [DocumentMeta.model_validate(s.to_dict()) for s in snaps]
                    for r in results:
                        self._docs[r.doc_id] = r
                    return results
            except Exception:
                pass
        return matching
