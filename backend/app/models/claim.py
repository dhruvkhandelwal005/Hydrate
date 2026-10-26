from __future__ import annotations
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

class ClaimNature(str, Enum):
    SOURCED_FACT = "SOURCED_FACT"
    INFERENCE = "INFERENCE"

class ClaimStatus(str, Enum):
    ASSERTED = "ASSERTED"
    CHALLENGED = "CHALLENGED"
    DEFENDED = "DEFENDED"
    CONCEDED = "CONCEDED"

class LineageStep(BaseModel):
    model_config = ConfigDict(extra="ignore")
    action: str  # e.g., "ASSERTED", "CHALLENGED_BY_LOKI", "DEFENDED_WITH_NEW_EVIDENCE", "CONCEDED"
    by: str  # "thor", "loki", "odin"
    detail: str
    evidence_ids: list[str] = Field(default_factory=list)
    timestamp: str

class Claim(BaseModel):
    model_config = ConfigDict(extra="allow")
    claim_id: str
    agent: Literal["thor", "loki"]
    run_id: str | None = None
    country: str
    sector: str
    claim: str
    nature: ClaimNature = ClaimNature.SOURCED_FACT
    evidence_ids: list[str] = Field(default_factory=list)
    low_estimate: float | None = None
    high_estimate: float | None = None
    unit: str | None = "USD_M"
    estimate_status: Literal["DEFENSIBLE_RANGE", "INSUFFICIENT_EVIDENCE"] = "INSUFFICIENT_EVIDENCE"
    calculation_method: str = ""
    assumptions: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "low"
    status: ClaimStatus = ClaimStatus.ASSERTED
    version: int = 1
    lineage: list[LineageStep] = Field(default_factory=list)
    concession_reason: str | None = None

    # Frontend contract fields
    title: str | None = None
    text: str | None = None
    estimate_low: float | None = None
    estimate_high: float | None = None
    period: str | None = None
    citations: list[dict[str, Any]] = Field(default_factory=list)
    calculation: dict[str, Any] | None = None
    attack: dict[str, Any] | None = None
    rebuttal: dict[str, Any] | None = None
