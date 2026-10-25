from __future__ import annotations
from enum import Enum
from typing import Any
from pydantic import BaseModel, ConfigDict, Field

class TradeRowStatus(str, Enum):
    VALID = "VALID"
    MISSING_VALUE = "MISSING_VALUE"
    MALFORMED_NUMBER = "MALFORMED_NUMBER"
    REPEATED_ROW = "REPEATED_ROW"
    INCONSISTENT_UNIT = "INCONSISTENT_UNIT"
    TRUNCATED = "TRUNCATED"

class TradeRow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    row_id: str  # e.g., ORV-0009-R1
    table_id: str
    source_id: str
    event_id: str = "E5"
    origin: str  # e.g., Orvan, Vanir
    destination: str  # e.g., Midgard, Tolan
    sector: str  # e.g., Wheat, Maize
    period: str  # e.g., "July 2026", "2026-07"
    year: int = 2026
    month: int = 7
    value_usd_m: float | None = None  # in Millions USD
    volume_tonnes: float | None = None  # in metric tonnes
    raw_value: str = ""
    raw_volume: str = ""
    unit: str = "USD_M"
    volume_unit: str = "tonnes"
    status: TradeRowStatus = TradeRowStatus.VALID
    validation_error: str | None = None
    raw_line: str = ""

    @property
    def citation_identity(self) -> str:
        return f"{self.source_id}:{self.row_id}"

class TradeTable(BaseModel):
    model_config = ConfigDict(extra="ignore")
    table_id: str
    source_id: str
    title: str = ""
    origin: str = ""
    destination: str = ""
    sector: str = ""
    rows: list[TradeRow] = Field(default_factory=list)
    has_anomalies: bool = False
    anomalies: list[str] = Field(default_factory=list)
