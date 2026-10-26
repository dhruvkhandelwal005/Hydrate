from __future__ import annotations
from datetime import date
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from app.models.document import ReliabilityTier

class EvidenceLedgerStatus(str, Enum):
    ADMISSIBLE = "ADMISSIBLE"
    POST_CUTOFF = "POST_CUTOFF"
    CORRECTED = "CORRECTED"
    RETRACTED = "RETRACTED"
    CONTRADICTED = "CONTRADICTED"
    DUPLICATE = "DUPLICATE"
    DAMAGED = "DAMAGED"
    BACKGROUND = "BACKGROUND"
    DIFFERENT_EVENT = "DIFFERENT_EVENT"
    WEAK_SOURCE = "WEAK_SOURCE"
    ACTIVE = "ACTIVE"

class EvidenceRef(BaseModel):
    model_config = ConfigDict(extra="ignore")
    source_id: str
    title: str = ""
    pub_date: date
    pub_time: str | None = None
    source_name: str = ""
    source_type: str = ""
    reliability: ReliabilityTier = ReliabilityTier.UNKNOWN
    event_id: str | None = None
    country: str | None = None
    sector: str | None = None
    locator: str = "document"  # e.g., [P1], Table 1 Row 2
    snippet: str = ""
    relation: Literal["SUPPORTS", "CONTRADICTS", "CORRECTS", "RETRACTS", "BACKGROUND", "UNCLEAR"] = "UNCLEAR"
    admissible: bool = True
    composite_score: float | None = None
    tier_weight: float = 0.70
    recency_weight: float = 0.30
    warnings: list[str] = Field(default_factory=list)

class ContradictionItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    contradiction_id: str
    source_a: str
    source_b: str
    topic: str
    explanation: str
    severity: Literal["HIGH", "MEDIUM", "LOW"] = "MEDIUM"
    is_correction: bool = False
    superseding_source: str | None = None

class ExcludedSource(BaseModel):
    model_config = ConfigDict(extra="ignore")
    source_id: str
    reason: str
    pub_date: date | None = None
    violation_type: Literal["CLOCK_VIOLATION", "MAP_EXCLUSION", "QUARANTINED", "DIFFERENT_EVENT", "PROMPT_INJECTION"] = "CLOCK_VIOLATION"
