from __future__ import annotations
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any
from pydantic import BaseModel, ConfigDict, Field
from app.models.evidence import EvidenceRef, ContradictionItem, ExcludedSource

class VerificationStatus(str, Enum):
    VERIFIED = "VERIFIED"
    NOT_VERIFIED = "NOT_VERIFIED"
    INSUFFICIENT = "INSUFFICIENT"

class ParsedQuestion(BaseModel):
    model_config = ConfigDict(extra="ignore")
    as_of_date: date
    event_hypothesis: str
    countries: list[str] = Field(default_factory=list)
    sectors: list[str] = Field(default_factory=list)
    requested_metric: str = "COMMERCIAL_EXPOSURE_RANGE"

class CaseFile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    case_id: str
    question: str
    as_of_date: date
    event_hypothesis: str = ""
    event_id: str = "NONE"
    countries: list[str] = Field(default_factory=list)
    sectors: list[str] = Field(default_factory=list)
    requested_metric: str = "NET_COMMERCIAL_VALUE_EXPOSURE"
    verification_status: VerificationStatus = VerificationStatus.INSUFFICIENT
    verification_summary: str = ""
    verification_evidence: list[EvidenceRef] = Field(default_factory=list)
    contradictions: list[ContradictionItem] = Field(default_factory=list)
    excluded_sources: list[ExcludedSource] = Field(default_factory=list)
    research_gaps: list[str] = Field(default_factory=list)
    query_history: list[str] = Field(default_factory=list)
    run_number: int = 1
    pack_id: str = "dev_pack_E5"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CaseCreateRequest(BaseModel):
    question: str = Field(min_length=5, max_length=5000)
    pack_id: str = Field(default="dev_pack_E5")
    as_of_date: date | None = None

class CaseRunRequest(BaseModel):
    research_gaps: list[str] = Field(default_factory=list)
