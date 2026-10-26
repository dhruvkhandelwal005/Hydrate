from __future__ import annotations
import os
import uuid
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.config import settings
from app.api.routes import health, ingestion, sources, briefing, stream, cases, judge_mode, export
from app.services.container import get_container

log = logging.getLogger("ragnarok.main")

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    log.info("RAGNAROK Adversarial Courtroom Backend starting...")
    try:
        container = get_container()
        log.info("Container initialized successfully. Document and Trade stores ready.")
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

# CORS configuration: must allow http://localhost:5173, http://localhost:5174, etc.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000"
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response

# Standard JSON error format: { "detail": "human readable message" } for all errors
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail_msg = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail_msg},
        headers={"X-Request-ID": request.headers.get("X-Request-ID", "")}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    msg = "; ".join(f"{err.get('loc', ['field'])[-1]}: {err.get('msg', 'invalid')}" for err in errors)
    return JSONResponse(
        status_code=422,
        content={"detail": f"Validation error: {msg}"},
        headers={"X-Request-ID": request.headers.get("X-Request-ID", "")}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error("Unhandled exception at %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers={"X-Request-ID": request.headers.get("X-Request-ID", "")}
    )

@app.get("/health")
@app.get("/api/health")
async def root_health():
    return {
        "status": "healthy",
        "platform": "RAGNAROK — Trial of the Nine Realms",
        "architecture": "Four-agent adversarial courtroom (Heimdall, Thor, Loki, Odin)",
        "service": "backend"
    }

# Register API routes under /api/v1 and /v1 alias
routers = [health.router, ingestion.router, sources.router, cases.router, stream.router, briefing.router, judge_mode.router, export.router]
for r in routers:
    app.include_router(r, prefix=settings.API_PREFIX)
    if settings.API_PREFIX != "/v1":
        app.include_router(r, prefix="/v1")

@app.get("/")
async def root():
    return {
        "service": "RAGNAROK — Trial of the Nine Realms",
        "description": "Adversarial Multi-Agent Supply Chain Disruption Intelligence Platform",
        "agents": ["Heimdall (Gatekeeper)", "Thor (High Exposure)", "Loki (Limited Exposure)", "Odin (Judge)"],
        "docs_url": "/docs",
        "health_url": f"{settings.API_PREFIX}/health"
    }
