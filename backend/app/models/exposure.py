from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

class ExposureRange(BaseModel):
    model_config = ConfigDict(extra="ignore")
    low_usd_m: float | None = None
    high_usd_m: float | None = None
    unit: str = "USD_M"
    status: Literal["DEFENSIBLE_RANGE", "INSUFFICIENT_EVIDENCE"] = "DEFENSIBLE_RANGE"

class SensitivityCard(BaseModel):
    model_config = ConfigDict(extra="ignore")
    parameter: str  # e.g., "Rail capacity", "Vanir substitute supply", "Port recovery"
    shift_description: str
    impact_usd_m: float  # + or - impact on exposure
    narrative: str

class CoverageMeter(BaseModel):
    model_config = ConfigDict(extra="ignore")
    has_baseline_evidence: bool = False
    has_disruption_evidence: bool = False
    has_substitution_evidence: bool = False
    has_admissible_current_evidence: bool = False
    has_thor_estimate: bool = False
    has_loki_estimate: bool = False
    has_cross_examination: bool = False
    has_odin_ruling: bool = False
    coverage_score: float = 0.0  # 0.0 to 1.0

class CountrySectorExposure(BaseModel):
    model_config = ConfigDict(extra="ignore")
    country: str
    sector: str
    baseline_direct_value: float = 0.0
    observed_post_event_value: float = 0.0
    gross_direct_loss: float = 0.0
    substitute_supply_offset: float = 0.0
    alternative_route_offset: float = 0.0
    price_adjustment: float = 0.0
    net_exposure_low: float = 0.0
    net_exposure_high: float = 0.0
    thor_range: ExposureRange = Field(default_factory=ExposureRange)
    loki_range: ExposureRange = Field(default_factory=ExposureRange)
    odin_final_range: ExposureRange = Field(default_factory=ExposureRange)
    confidence: Literal["high", "medium", "low"] = "medium"
    calibrated_score: float = 0.75
    primary_evidence: list[str] = Field(default_factory=list)
    calculation_method: str = ""
    assumptions: list[str] = Field(default_factory=list)
    coverage: CoverageMeter = Field(default_factory=CoverageMeter)
    sensitivity_cards: list[SensitivityCard] = Field(default_factory=list)

class ExposureMatrix(BaseModel):
    model_config = ConfigDict(extra="ignore")
    case_id: str
    items: list[CountrySectorExposure] = Field(default_factory=list)
    overall_confidence: float = 0.8
