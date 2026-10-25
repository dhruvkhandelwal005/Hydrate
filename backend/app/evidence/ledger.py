from __future__ import annotations
from datetime import date
from typing import Any
from app.models.evidence import EvidenceRef, EvidenceLedgerStatus
from app.models.document import DocumentMeta, DocumentStatus, ReliabilityTier

class TemporalEvidenceLedger:
    """
    Deterministic ledger tracking the state and validity of all evidence items.
    Maintains transparency: never hides conflicting or damaged evidence, but tags them with warnings.
    """
    def __init__(self, as_of_date: date):
        self.as_of_date = as_of_date
        self._entries: dict[str, EvidenceRef] = {}

    def register_document(
        self,
        doc: DocumentMeta,
        relation: str = "UNCLEAR",
        contradiction_notes: list[str] | None = None
    ) -> EvidenceRef:
        warnings: list[str] = list(contradiction_notes or [])
        admissible = True

        if doc.pub_date > self.as_of_date:
            admissible = False
            warnings.append(f"CLOCK_VIOLATION: Published on {doc.pub_date}, after as-of cutoff {self.as_of_date}")

        if doc.status == DocumentStatus.DAMAGED:
            admissible = False
            warnings.append("DAMAGED_DOCUMENT: Format or text corrupted")

        if doc.status == DocumentStatus.EMPTY:
            admissible = False
            warnings.append("EMPTY_DOCUMENT: Contains no data")

        if doc.status == DocumentStatus.QUARANTINED:
            admissible = False
            warnings.append(f"QUARANTINED: {doc.quarantine_reason or 'Excluded'}")

        if doc.reliability == ReliabilityTier.TIER_4:
            warnings.append("WEAK_SOURCE: Tier 4 outlet (unverified/tabloid/blog). Requires corroboration.")

        if doc.status == DocumentStatus.DUPLICATE:
            warnings.append("DUPLICATE_SOURCE: Near-duplicate of earlier reporting.")

        snippet = doc.text[:500] if doc.text else ""
        ref = EvidenceRef(
            source_id=doc.doc_id,
            title=doc.title,
            pub_date=doc.pub_date,
            pub_time=doc.pub_time,
            source_name=doc.source_name,
            source_type=doc.source_type,
            reliability=doc.reliability,
            event_id=doc.event_id,
            country=doc.country,
            sector=doc.sector,
            locator="document",
            snippet=snippet,
            relation=relation,
            admissible=admissible,
            warnings=warnings
        )
        self._entries[doc.doc_id] = ref
        return ref

    def get_entry(self, source_id: str) -> EvidenceRef | None:
        return self._entries.get(source_id)

    def list_entries(self) -> list[EvidenceRef]:
        return list(self._entries.values())
