from __future__ import annotations
import re
from datetime import date
from typing import Any
from app.models.document import DocumentMeta, DocumentStatus
from app.models.claim import Claim

CITATION_BRACKET_RE = re.compile(r"\[([A-Z]{3}-\d{4})(?:,\s*([^\]]+))?\]")

class CitationValidator:
    def __init__(self, document_map: dict[str, DocumentMeta], as_of_date: date):
        self.document_map = document_map
        self.as_of_date = as_of_date

    def validate_claim_citations(self, claim: Claim) -> tuple[bool, list[str]]:
        """
        Validates that every citation referenced by a claim is valid, admissible,
        and exists in the corpus as of the case date.
        """
        errors: list[str] = []
        if not claim.evidence_ids:
            return False, ["Claim lacks any cited source IDs"]

        for src_id in claim.evidence_ids:
            # Parse source id (could be DOC_ID or DOC_ID:ROW_ID)
            base_id = src_id.split(":")[0].strip()
            if base_id not in self.document_map:
                errors.append(f"Cited source ID {base_id} does not exist in ingested documents")
                continue

            doc = self.document_map[base_id]
            if doc.status in (DocumentStatus.EMPTY, DocumentStatus.DAMAGED, DocumentStatus.QUARANTINED):
                errors.append(f"Cited source {base_id} is quarantined/damaged/empty: {doc.status}")

            if doc.pub_date > self.as_of_date:
                errors.append(f"CLOCK_VIOLATION: Cited source {base_id} published on {doc.pub_date} after as-of date {self.as_of_date}")

        return len(errors) == 0, errors

    def format_citation(self, doc_id: str) -> str:
        doc = self.document_map.get(doc_id)
        if not doc:
            return f"[{doc_id}]"
        time_str = f" {doc.pub_time}" if doc.pub_time else ""
        return f"[{doc.doc_id}, {doc.pub_date.isoformat()}{time_str}]"

    def verify_arithmetic(
        self,
        baseline: float,
        observed: float,
        claimed_loss: float,
        tolerance: float = 0.5
    ) -> tuple[bool, float, str]:
        """
        Recomputes arithmetic deterministically.
        Loss = Baseline - Observed.
        """
        expected_loss = round(baseline - observed, 2)
        diff = abs(expected_loss - claimed_loss)
        if diff <= tolerance:
            return True, expected_loss, "Arithmetic verified"
        return False, expected_loss, f"Arithmetic discrepancy: baseline ({baseline}) - observed ({observed}) = {expected_loss}, but claimed {claimed_loss}"
