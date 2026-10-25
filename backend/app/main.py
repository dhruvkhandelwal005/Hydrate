from __future__ import annotations
import os
import uuid
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.routes import health, ingestion, sources, briefing, stream, cases, judge_mode, export
from app.services.container import get_container

log = logging.getLogger("ragnarok.main")

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    log.info("RAGNAROK Adversarial Courtroom Backend starting...")
    # Initialize container eagerly
    try:
        container = get_container()
        log.info("Container initialized successfully. Firestore connected.")
    except Exception as e:
        log.warning("Container initialization notice: %s", e)
    yield
    log.info("RAGNAROK Backend shutdown complete.")

app = FastAPI(
    title="RAGNAROK — Trial of the Nine Realms",
    description="Adversarial Multi-Agent Supply Chain Disruption Intelligence Platform",
    version="2.0.0",
    lifespan=lifespan
)

# CORS configuration
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
if "*" in origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

from fastapi.responses import JSONResponse

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error("Unhandled exception at %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": str(exc),
            "error_type": type(exc).__name__,
            "path": request.url.path,
            "request_id": request.headers.get("X-Request-ID")
        }
    )

# Register API routes under /api/v1
app.include_router(health.router, prefix=settings.API_PREFIX)
app.include_router(ingestion.router, prefix=settings.API_PREFIX)
app.include_router(sources.router, prefix=settings.API_PREFIX)
app.include_router(briefing.router, prefix=settings.API_PREFIX)
app.include_router(stream.router, prefix=settings.API_PREFIX)
app.include_router(cases.router, prefix=settings.API_PREFIX)
app.include_router(judge_mode.router, prefix=settings.API_PREFIX)
app.include_router(export.router, prefix=settings.API_PREFIX)

@app.get("/")
async def root():
    return {
        "service": "RAGNAROK — Trial of the Nine Realms",
        "description": "Adversarial Multi-Agent Supply Chain Disruption Intelligence Platform",
        "agents": ["Heimdall (Gatekeeper)", "Thor (High Exposure)", "Loki (Limited Exposure)", "Odin (Judge)"],
        "docs_url": "/docs",
        "health_url": f"{settings.API_PREFIX}/health"
    }
