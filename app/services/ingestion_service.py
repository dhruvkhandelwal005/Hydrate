from __future__ import annotations
from pathlib import Path
from typing import Any
from app.models.document import IngestionReport
from app.services.container import Container

class IngestionService:
    def __init__(self, container: Container):
        self.container = container

    async def ingest_pack(self, source_path: Path | str, pack_id: str | None = None) -> IngestionReport:
        return await self.container.loader.ingest_pack(source_path, pack_id)

    async def get_pack_status(self, pack_id: str) -> IngestionReport | None:
        return await self.container.doc_repo.get_pack(pack_id)
