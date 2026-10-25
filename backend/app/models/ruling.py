from __future__ import annotations
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from app.models.claim import ClaimNature

class RulingVerdict(str, Enum):
    ESTABLISHED = "ESTABLISHED"
    CONTESTED = "CONTESTED"
    CONCEDED = "CONCEDED"
    REJECTED = "REJECTED"

class ClaimRuling(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ruling_id: str = ""
    claim_id: str = ""
    country: str = "Midgard"
    sector: str = "Wheat"
    advocate: Literal["thor", "loki"] = "thor"
    original_claim: str = ""
    nature: ClaimNature = ClaimNature.SOURCED_FACT
    verdict: RulingVerdict = RulingVerdict.CONTESTED
    justification: str = "Evaluated against Runemark evidence"
    citations_valid: bool = True
    admissibility_valid: bool = True
    arithmetic_valid: bool = True
    accepted_low_estimate: float | None = None
    accepted_high_estimate: float | None = None
    confidence_score: float = 0.5  # 0.0 to 1.0 calibrated

class SufficiencyVerdict(str, Enum):
    SUFFICIENT = "SUFFICIENT"
    RESEARCH_REQUIRED = "RESEARCH_REQUIRED"

class JudicialReview(BaseModel):
    model_config = ConfigDict(extra="ignore")
    case_id: str
    run_number: int
    rulings: list[ClaimRuling] = Field(default_factory=list)
    sufficiency: SufficiencyVerdict = SufficiencyVerdict.RESEARCH_REQUIRED
    sufficiency_reasoning: str = ""
    research_gaps: list[str] = Field(default_factory=list)
    established_claims_count: int = 0
    contested_claims_count: int = 0
    conceded_claims_count: int = 0
    rejected_claims_count: int = 0
