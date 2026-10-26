from __future__ import annotations
from pathlib import Path
from typing import Tuple

def parse_txt_file(path: Path) -> Tuple[str, str, str | None]:
    """
    Parses a TXT file with robust fallback decoding.
    Handles mixed UTF-8 headers with UTF-16 body (e.g. ORV-0007.txt),
    plain UTF-8, Latin-1, CP1252, and returns:
    (raw_text, detected_encoding, error_note)
    """
    data = path.read_bytes()
    if not data:
        return "", "empty", "File is 0 bytes"

    # Check for mixed header (ASCII/UTF-8 before '---') and UTF-16 body after '---'
    separator = b"---\n"
    if separator in data:
        header_bytes, body_bytes = data.split(separator, 1)
        # Try decoding header as utf-8
        try:
            header_str = header_bytes.decode("utf-8")
        except Exception:
            header_str = header_bytes.decode("latin-1", errors="replace")

        # Decode body bytes
        body_str = None
        # Check UTF-16 LE BOM \xff\xfe or BE \xfe\xff
        if body_bytes.startswith(b"\xff\xfe") or body_bytes.startswith(b"\xfe\xff"):
            try:
                body_str = body_bytes.decode("utf-16")
            except Exception:
                pass

        if body_str is None:
            for enc in ("utf-8", "utf-16", "cp1252", "latin-1"):
                try:
                    body_str = body_bytes.decode(enc)
                    break
                except Exception:
                    continue

        if body_str is None:
            body_str = body_bytes.decode("latin-1", errors="replace")

        full_text = f"{header_str}---\n{body_str}"
        return full_text, "mixed/utf-8+utf-16", None

    # Normal full file decoding attempts
    for enc in ("utf-8-sig", "utf-8", "utf-16", "cp1252", "latin-1"):
        try:
            return data.decode(enc), enc, None
        except UnicodeDecodeError:
            continue

    # Fallback with replacement
    return data.decode("latin-1", errors="replace"), "latin-1-lossy", "Lossy decoding fallback applied"
