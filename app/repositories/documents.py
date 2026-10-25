from __future__ import annotations
from datetime import date
from typing import Any
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from app.models.document import DocumentMeta, IngestionReport
from app.repositories.firebase import fs_retry

class FirestoreDocumentRepository:
    def __init__(self, db: firestore.Client):
        self.db = db

    async def save_document(self, doc: DocumentMeta) -> None:
        data = doc.model_dump(mode="json")
        data["pub_date"] = doc.pub_date.isoformat()
        data["created_at"] = doc.created_at
        await fs_retry(lambda: self.db.collection("documents").document(doc.doc_id).set(data, merge=True))

    async def get_document(self, doc_id: str) -> DocumentMeta | None:
        snap = await fs_retry(lambda: self.db.collection("documents").document(doc_id).get())
        if not snap.exists:
            return None
        return DocumentMeta.model_validate(snap.to_dict())

    async def save_pack(self, report: IngestionReport) -> None:
        data = report.model_dump(mode="json")
        data["ingested_at"] = report.ingested_at
        await fs_retry(lambda: self.db.collection("packs").document(report.pack_id).set(data, merge=True))

    async def get_pack(self, pack_id: str) -> IngestionReport | None:
        snap = await fs_retry(lambda: self.db.collection("packs").document(pack_id).get())
        if not snap.exists:
            return None
        return IngestionReport.model_validate(snap.to_dict())

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
        q = self.db.collection("documents").where(filter=FieldFilter("pack_id", "==", pack_id))
        if as_of_date:
            # HARD firewall: pre-filter at database layer
            q = q.where(filter=FieldFilter("pub_date", "<=", as_of_date.isoformat()))
        if country:
            q = q.where(filter=FieldFilter("country", "==", country))
        if sector:
            q = q.where(filter=FieldFilter("sector", "==", sector))
        if source_type:
            q = q.where(filter=FieldFilter("source_type", "==", source_type))
        if reliability:
            q = q.where(filter=FieldFilter("reliability", "==", reliability))

        snaps = await fs_retry(lambda: list(q.limit(limit).stream()))
        return [DocumentMeta.model_validate(s.to_dict()) for s in snaps]
