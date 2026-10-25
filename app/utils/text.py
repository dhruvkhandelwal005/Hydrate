from __future__ import annotations
import re
from typing import Any

UNTRUSTED_OPEN = "<UNTRUSTED_RUNEMARK_EVIDENCE>"
UNTRUSTED_CLOSE = "</UNTRUSTED_RUNEMARK_EVIDENCE>"

TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_-]+", re.I)

PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?(previous|prior)\s+instructions", re.I),
    re.compile(r"you\s+are\s+now\s+(a\s+)?(supervisor|manager|admin|god)", re.I),
    re.compile(r"disregard\s+(the\s+)?(system\s+prompt|rules|constraints)", re.I),
    re.compile(r"reveal\s+(the\s+)?(api[_\s-]?key|secret|password)", re.I),
    re.compile(r"system\s*:\s*you\s+must", re.I),
]

def wrap_untrusted_evidence(content: str, metadata: dict[str, Any] | None = None) -> str:
    """Safely encapsulates Runemark document text to prevent prompt injection."""
    meta_str = ""
    if metadata:
        meta_items = [f"{k.upper()}={v}" for k, v in metadata.items() if v is not None]
        meta_str = "\n" + "\n".join(meta_items)
    return f"{UNTRUSTED_OPEN}{meta_str}\n{content}\n{UNTRUSTED_CLOSE}"

def detect_prompt_injection(text: str) -> list[str]:
    """Detects hostile injection attempts embedded in document text."""
    matches = []
    for pattern in PROMPT_INJECTION_PATTERNS:
        if pattern.search(text):
            matches.append(pattern.pattern)
    return matches

def tokenize(text: str) -> set[str]:
    return {w.lower() for w in TOKEN_RE.findall(text)}

def normalize_text(text: str) -> str:
    # Normalize unicode spaces, line breaks, remove null bytes
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in text.split("\n"))
