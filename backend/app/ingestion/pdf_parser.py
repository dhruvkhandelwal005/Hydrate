from __future__ import annotations
from pathlib import Path
from typing import Tuple
import pymupdf

def parse_pdf_file(path: Path) -> Tuple[str, int, str | None]:
    """
    Parses a PDF file using PyMuPDF.
    Preserves page numbers, paragraph markings, and layout.
    """
    try:
        doc = pymupdf.open(path)
    except Exception as e:
        return "", 0, f"PDF open error: {type(e).__name__}: {e}"

    pages_text: list[str] = []
    page_count = len(doc)
    p_num = 1

    for page_idx in range(page_count):
        page = doc[page_idx]
        text = page.get_text("text").strip()
        if not text:
            continue
        blocks = page.get_text("blocks")
        for b in blocks:
            b_text = b[4].strip()
            if not b_text:
                continue
            if not b_text.startswith("[P"):
                pages_text.append(f"[P{p_num}] {b_text}")
            else:
                pages_text.append(b_text)
            p_num += 1

    full_text = "\n\n".join(pages_text)
    return full_text, page_count, None
