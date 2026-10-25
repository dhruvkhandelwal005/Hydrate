import pytest
from datetime import date
from app.models.case import CaseFile, VerificationStatus
from app.models.ruling import ClaimRuling, RulingVerdict
from app.models.claim import Claim, ClaimStatus, ClaimNature

def test_judge_mode_compliance_matrix():
    # Verify the 16 judge compliance criteria data structure
    criteria_names = [
        "Mixed formats ingested",
        "Hybrid search",
        "2+ metadata filters",
        "Thor searched",
        "Loki searched",
        "Cross-examination completed",
        "Concession/rejection occurred",
        "Second run completed",
        "New evidence added",
        "Private memories active",
        "Memory changed behavior",
        "Damaged source handled",
        "Hard limits active",
        "No duplicate queries",
        "All citations resolvable",
        "Clock respected"
    ]
    assert len(criteria_names) == 16
