from __future__ import annotations
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from app.models.claim import Claim

class ChallengeWeaknessType(str, Enum):
    UNRELIABLE_SOURCE = "UNRELIABLE_SOURCE"
    OUTDATED_EVIDENCE = "OUTDATED_EVIDENCE"
    RETRACTED_REPORT = "RETRACTED_REPORT"
    ARITHMETIC_PROBLEM = "ARITHMETIC_PROBLEM"
    PHYSICAL_COMMERCIAL_CONFUSION = "PHYSICAL_COMMERCIAL_CONFUSION"
    IGNORED_SUBSTITUTION = "IGNORED_SUBSTITUTION"
    IGNORED_CAPACITY_LIMIT = "IGNORED_CAPACITY_LIMIT"
    UNSUPPORTED_ASSUMPTION = "UNSUPPORTED_ASSUMPTION"
    CAUSAL_LEAP = "CAUSAL_LEAP"
    WRONG_COUNTRY = "WRONG_COUNTRY"
    WRONG_SECTOR = "WRONG_SECTOR"
    DIFFERENT_EVENT = "DIFFERENT_EVENT"
    CLOCK_VIOLATION = "CLOCK_VIOLATION"
    OTHER = "OTHER"

class Challenge(BaseModel):
    model_config = ConfigDict(extra="ignore")
    challenge_id: str
    attacker: Literal["thor", "loki"]
    target_claim_id: str
    weakness_type: ChallengeWeaknessType = ChallengeWeaknessType.OTHER
    challenge_text: str
    counter_evidence: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "medium"

class DefenceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    target_claim_id: str
    action: Literal["DEFEND", "CONCEDE"]
    reasoning: str
    new_evidence_ids: list[str] = Field(default_factory=list)
    revised_claim: Claim | None = None

class CrossExaminationReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    case_id: str
    run_id: str
    agent: Literal["thor", "loki"]
    challenges: list[Challenge] = Field(default_factory=list)
    concessions_made: list[str] = Field(default_factory=list)

class DefenceReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    case_id: str
    run_id: str
    agent: Literal["thor", "loki"]
    responses: list[DefenceResponse] = Field(default_factory=list)
