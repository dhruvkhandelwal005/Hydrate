from __future__ import annotations
import re
import uuid
from typing import Any
from app.models.evidence import ContradictionItem
from app.models.document import DocumentMeta

CORRECTION_TERMS = re.compile(r"\b(correction|retraction|clarification|amendment|withdrawn|erratum|corrected)\b", re.I)
OPPOSING_PROPOSITIONS = [
    (re.compile(r"famine|catastrophe|starvation|collapse", re.I), re.compile(r"sufficient|stable|adequate|routine|manageable", re.I)),
    (re.compile(r"berths\s+closed|port\s+halted|shutdown", re.I), re.compile(r"operating|resumed|loading\s+at\s+normal", re.I)),
    (re.compile(r"no\s+substitute|irreplaceable", re.I), re.compile(r"substitute|alternative|rail\s+gain", re.I)),
]

class ContradictionEngine:
    """
    Deterministic engine surfacing potential contradictions and correction relationships.
    Surfaces evidentiary tensions for Odin and advocate cross-examination.
    """
    def find_relationships(self, documents: list[DocumentMeta]) -> list[ContradictionItem]:
        items: list[ContradictionItem] = []
        doc_count = len(documents)

        for i in range(doc_count):
            doc_a = documents[i]
            for j in range(i + 1, doc_count):
                doc_b = documents[j]

                # 1. Check for formal Correction / Retraction references
                if CORRECTION_TERMS.search(doc_b.title) or CORRECTION_TERMS.search(doc_b.text[:500]):
                    if doc_a.doc_id in doc_b.text or (doc_a.country == doc_b.country and doc_a.sector == doc_b.sector):
                        items.append(ContradictionItem(
                            contradiction_id=str(uuid.uuid4()),
                            source_a=doc_a.doc_id,
                            source_b=doc_b.doc_id,
                            topic=f"Correction/Retraction: {doc_b.title}",
                            explanation=f"{doc_b.doc_id} ({doc_b.source_name}) issued correction affecting earlier reporting in {doc_a.doc_id}",
                            severity="HIGH",
                            is_correction=True,
                            superseding_source=doc_b.doc_id
                        ))
                        continue

                # 2. Check for opposing factual assertions on same entity & sector
                if doc_a.country and doc_a.country == doc_b.country:
                    if doc_a.sector and doc_a.sector.lower() == (doc_b.sector or "").lower():
                        for p1, p2 in OPPOSING_PROPOSITIONS:
                            a_has_1 = bool(p1.search(doc_a.text))
                            a_has_2 = bool(p2.search(doc_a.text))
                            b_has_1 = bool(p1.search(doc_b.text))
                            b_has_2 = bool(p2.search(doc_b.text))

                            if (a_has_1 and b_has_2) or (a_has_2 and b_has_1):
                                items.append(ContradictionItem(
                                    contradiction_id=str(uuid.uuid4()),
                                    source_a=doc_a.doc_id,
                                    source_b=doc_b.doc_id,
                                    topic=f"Opposing claims on {doc_a.country} {doc_a.sector}",
                                    explanation=f"{doc_a.doc_id} emphasizes severe impact while {doc_b.doc_id} highlights stability or substitution.",
                                    severity="MEDIUM",
                                    is_correction=False
                                ))
                                break
        return items
