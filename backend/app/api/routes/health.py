from __future__ import annotations
from fastapi import APIRouter
from app.config import settings

router = APIRouter()

@router.get("/health")
async def health():
    return {
        "status": "healthy",
        "platform": "RAGNAROK — Trial of the Nine Realms",
        "architecture": "Four-agent adversarial courtroom (Heimdall, Thor, Loki, Odin)",
        "database": "Firebase Cloud Firestore",
        "llm_provider": settings.LLM_PROVIDER,
        "embedding_provider": settings.EMBEDDING_PROVIDER
    }
