from __future__ import annotations
import re
from pathlib import Path
from app.config import settings
from app.utils.text import detect_prompt_injection

MAP_FILE_PATTERNS = [
    re.compile(r"map", re.I),
    re.compile(r"runemark.*\.png$", re.I),
    re.compile(r"runemark.*\.jpe?g$", re.I),
    re.compile(r"runemark.*\.webp$", re.I),
]

def is_restricted_map(file_path: Path | str) -> bool:
    """Strictly identifies runemark map files which must NEVER be indexed or passed to LLMs."""
    name = Path(file_path).name.lower()
    if name in [f.lower() for f in settings.RESTRICTED_MAP_FILENAMES]:
        return True
    if any(p.search(name) for p in MAP_FILE_PATTERNS):
        return True
    return False

def inspect_for_hostile_content(text: str) -> list[str]:
    """Detects prompt injection attempts in Runemark documents."""
    return detect_prompt_injection(text)
