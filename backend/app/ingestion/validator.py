from __future__ import annotations
from app.models.document import DocumentStatus

def evaluate_document_status(
    raw_size: int,
    extracted_text: str,
    parse_error: str | None,
    is_map: bool,
    is_duplicate: bool
) -> tuple[DocumentStatus, str | None, str | None]:
    """
    Determines the document status and returns:
    (status, quarantine_reason, usable_portion_summary)
    """
    if is_map:
        return DocumentStatus.QUARANTINED, "Absolute Map Restriction: map file excluded from intelligence processing", None

    if raw_size == 0 or len(extracted_text.strip()) == 0:
        return DocumentStatus.EMPTY, "Document content is empty (0 bytes or no extractable text)", None

    if is_duplicate:
        return DocumentStatus.DUPLICATE, "Duplicate content detected via content fingerprint", "Duplicate copy"

    if parse_error:
        if len(extracted_text.strip()) > 100:
            return DocumentStatus.PARTIAL, None, f"Partially recovered text with warning: {parse_error}"
        return DocumentStatus.DAMAGED, f"Severe parse failure: {parse_error}", None

    if len(extracted_text.strip()) < 50:
        return DocumentStatus.PARTIAL, None, "Very short / truncated document content"

    return DocumentStatus.VALID, None, "Complete valid document"
