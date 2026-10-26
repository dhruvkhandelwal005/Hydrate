from __future__ import annotations
import asyncio
import logging
from pathlib import Path
from typing import Any, Callable, TypeVar
import firebase_admin
from firebase_admin import credentials, firestore
from app.config import settings

log = logging.getLogger("ragnarok.firebase")

T = TypeVar("T")

_db_client: firestore.Client | None = None

def get_firestore_client() -> firestore.Client | None:
    global _db_client
    if _db_client is not None:
        return _db_client

    if firebase_admin._apps:
        try:
            _db_client = firestore.client()
            return _db_client
        except Exception as e:
            log.warning("Could not connect to existing Firebase app: %s", e)
            return None

    cert_path = Path(settings.FIREBASE_SERVICE_ACCOUNT_PATH)
    if not cert_path.is_absolute():
        from app.config import BASE_DIR
        cert_path = (BASE_DIR / cert_path).resolve()

    if not cert_path.exists():
        log.warning("Firebase service account not found at %s. Running in high-performance local in-memory storage mode.", cert_path)
        return None

    try:
        cred = credentials.Certificate(str(cert_path))
        options: dict[str, str] = {}
        if settings.FIREBASE_PROJECT_ID:
            options["projectId"] = settings.FIREBASE_PROJECT_ID
        if settings.FIREBASE_STORAGE_BUCKET:
            options["storageBucket"] = settings.FIREBASE_STORAGE_BUCKET

        firebase_admin.initialize_app(cred, options or None)
        _db_client = firestore.client()
        return _db_client
    except Exception as exc:
        log.warning("Failed to initialize Firebase app: %s. Running in local storage mode.", exc)
        return None

async def fs_retry(fn: Callable[[], T], attempts: int = 3, initial_delay: float = 0.2) -> T | None:
    last_exc = None
    for i in range(attempts):
        try:
            return await asyncio.to_thread(fn)
        except Exception as exc:
            last_exc = exc
            if i + 1 < attempts:
                await asyncio.sleep(initial_delay * (2 ** i))
    log.warning("Firestore operation failed after %d attempts: %s", attempts, last_exc)
    return None

