from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from app.models.exposure import CountrySectorExposure

class FindingItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    finding_id: str = ""
    nature: Literal["SOURCED_FACT", "INFERENCE"] = "SOURCED_FACT"
    statement: str = ""
    evidence_citations: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "medium"

class OutlookScenario(BaseModel):
    model_config = ConfigDict(extra="ignore")
    scenario_type: Literal["BASE", "UPSIDE", "DOWNSIDE"] = "BASE"
    description: str = ""
    key_drivers: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)

class ExecutiveBriefing(BaseModel):
    model_config = ConfigDict(extra="ignore")
    briefing_id: str
    case_id: str
    title: str = "Trial of the Nine Realms — Supply Chain Disruption Intelligence Briefing"
    as_of_date: str
    event_verification: str
    executive_summary: str
    established_findings: list[FindingItem] = Field(default_factory=list)
    contested_findings: list[FindingItem] = Field(default_factory=list)
    conceded_findings: list[FindingItem] = Field(default_factory=list)
    exposure_matrix: list[CountrySectorExposure] = Field(default_factory=list)
    next_quarter_outlook: list[OutlookScenario] = Field(default_factory=list)
    critical_assumptions: list[str] = Field(default_factory=list)
    source_citations: list[dict[str, str]] = Field(default_factory=list)
    rendered_markdown: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
