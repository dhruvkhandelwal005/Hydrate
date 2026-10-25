from __future__ import annotations
import shutil
import tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from pydantic import BaseModel, Field
from app.models.document import IngestionReport
from app.services.container import get_container, Container
from app.services.ingestion_service import IngestionService

router = APIRouter(prefix="/packs", tags=["Ingestion"])

class DirectoryIngestRequest(BaseModel):
    directory_path: str = Field(min_length=1)
    pack_id: str | None = None

@router.post("/ingest", response_model=IngestionReport)
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
            report = await service.ingest_pack(temp_zip, pack_id=pack_id or Path(file.filename).stem)
            return report
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    if directory_path:
        path = Path(directory_path)
        if not path.is_absolute():
            from app.config import BASE_DIR
            path = (BASE_DIR / path).resolve()
        if not path.exists():
            raise HTTPException(404, f"Directory not found: {directory_path}")
        report = await service.ingest_pack(path, pack_id=pack_id or path.name)
        return report

    # Default to dev_pack_E5
    from app.config import BASE_DIR
    dev_pack = (BASE_DIR / "dev_pack_E5").resolve()
    if dev_pack.exists():
        report = await service.ingest_pack(dev_pack, pack_id="dev_pack_E5")
        return report

    raise HTTPException(400, "Must provide either an uploaded zip file or a directory_path")

@router.get("/{pack_id}/status", response_model=IngestionReport)
async def get_pack_status_endpoint(pack_id: str, container: Container = Depends(get_container)):
    service = IngestionService(container)
    report = await service.get_pack_status(pack_id)
    if not report:
        raise HTTPException(404, f"Pack {pack_id} not found")
    return report
