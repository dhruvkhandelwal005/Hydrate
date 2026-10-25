from __future__ import annotations
import re
from app.models.document import Chunk

PARAGRAPH_LOCATOR_RE = re.compile(r"(\[P\d+\])")

def chunk_document(doc_id: str, text: str, max_chars: int = 1500) -> list[Chunk]:
    """
    Splits narrative documents into chunks, respecting [P1], [P2] paragraph locators.
    """
    # Remove header metadata before '---'
    body = text
    if "---" in text:
        parts = text.split("---", 1)
        body = parts[1].strip()

    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [p.strip() for p in body.split("\n") if p.strip()]

    chunks: list[Chunk] = []
    chunk_idx = 1

    current_text: list[str] = []
    current_locator = f"[P{chunk_idx}]"
    current_len = 0

    for p in paragraphs:
        loc_match = PARAGRAPH_LOCATOR_RE.search(p)
        locator = loc_match.group(1) if loc_match else f"[P{chunk_idx}]"

        if current_len + len(p) > max_chars and current_text:
            chunks.append(Chunk(
                chunk_id=f"{doc_id}-C{chunk_idx}",
                doc_id=doc_id,
                chunk_index=chunk_idx,
                text="\n\n".join(current_text),
                locator=current_locator
            ))
            chunk_idx += 1
            current_text = [p]
            current_locator = locator
            current_len = len(p)
        else:
            if not current_text:
                current_locator = locator
            current_text.append(p)
            current_len += len(p)

    if current_text:
        chunks.append(Chunk(
            chunk_id=f"{doc_id}-C{chunk_idx}",
            doc_id=doc_id,
            chunk_index=chunk_idx,
            text="\n\n".join(current_text),
            locator=current_locator
        ))

    return chunks
