from __future__ import annotations
import hashlib
from pathlib import Path
from typing import BinaryIO

def compute_sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def compute_sha256_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

def parse_hashes_sha256(content: str) -> dict[str, str]:
    """Parse hashes.sha256 into a dict of {filename: sha256_hash}."""
    result: dict[str, str] = {}
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(maxsplit=1)
        if len(parts) == 2:
            h, name = parts[0].strip(), parts[1].strip().lstrip("*")
            result[Path(name).name] = h
    return result

def content_fingerprint(text: str) -> str:
    """Generate normalized content hash for deduplication."""
    norm = "".join(text.lower().split())
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()
