from __future__ import annotations
from app.utils.hashing import content_fingerprint

class DocumentDeduplicator:
    def __init__(self):
        self._seen_fingerprints: dict[str, str] = {}  # fingerprint -> doc_id

    def check_and_register(self, doc_id: str, text: str) -> tuple[bool, str | None]:
        """
        Returns (is_duplicate, original_doc_id).
        """
        if not text.strip():
            return False, None
        fp = content_fingerprint(text)
        if fp in self._seen_fingerprints:
            return True, self._seen_fingerprints[fp]
        self._seen_fingerprints[fp] = doc_id
        return False, None
