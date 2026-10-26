from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends
from app.models.briefing import ExecutiveBriefing
from app.services.container import get_container, Container
from app.services.case_service import CaseService

router = APIRouter(prefix="/cases", tags=["Briefings & Exposure"])

@router.get("/{case_id}/briefing")
async def get_briefing_endpoint(case_id: str, container: Container = Depends(get_container)):
    service = CaseService(container)
    briefing = await service.get_briefing(case_id)
    if not briefing:
        raise HTTPException(404, f"Briefing for case {case_id} not found or trial still running")
    return briefing.model_dump(mode="json")

@router.get("/{case_id}/exposure")
async def get_exposure_endpoint(case_id: str, container: Container = Depends(get_container)):
    service = CaseService(container)
    briefing = await service.get_briefing(case_id)
    if not briefing:
        raise HTTPException(404, f"Exposure matrix for case {case_id} not available")
    return {"case_id": case_id, "exposure_matrix": [e.model_dump(mode="json") for e in briefing.exposure_matrix]}
