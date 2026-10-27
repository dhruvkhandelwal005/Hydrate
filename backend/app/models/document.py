from __future__ import annotations
from datetime import date, datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, ConfigDict, Field

class DocumentStatus(str, Enum):
    VALID = "VALID"
    PARTIAL = "PARTIAL"
    EMPTY = "EMPTY"
    DAMAGED = "DAMAGED"
    DUPLICATE = "DUPLICATE"
    MALFORMED = "MALFORMED"
    QUARANTINED = "QUARANTINED"

class ReliabilityTier(str, Enum):
    TIER_1 = "TIER_1"
    TIER_2 = "TIER_2"
    TIER_3 = "TIER_3"
    TIER_4 = "TIER_4"
    UNKNOWN = "UNKNOWN"

class Chunk(BaseModel):
    model_config = ConfigDict(extra="ignore")
    chunk_id: str
    doc_id: str
    chunk_index: int
    text: str
    locator: str  # e.g. [P1], Page 1
    embedding: list[float] = Field(default_factory=list)

class DocumentMeta(BaseModel):
    model_config = ConfigDict(extra="ignore")
    doc_id: str
    pack_id: str
    event_id: str = "NONE"
    title: str = ""
    source_name: str = ""
    source_type: str = ""
    reliability: ReliabilityTier = ReliabilityTier.UNKNOWN
    pub_date: date
    pub_time: str | None = None
    country: str | None = None
    sector: str | None = None
    language: str = "en"
    format: str = "TXT"
    file_name: str = ""
    file_path: str = ""
    sha256_hash: str = ""
    status: DocumentStatus = DocumentStatus.VALID
    quarantine_reason: str | None = None
    usable_portion_summary: str | None = None
    limitations: list[str] = Field(default_factory=list)
    has_trade_tables: bool = False
    prompt_injection_flags: list[str] = Field(default_factory=list)
    is_map: bool = False
    text: str = ""
    chunks: list[Chunk] = Field(default_factory=list)
    embedding: list[float] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now())

class IngestionReport(BaseModel):
    pack_id: str
    total_discovered: int = 0
    total_parsed: int = 0
    total_valid: int = 0
    total_partial: int = 0
    total_damaged: int = 0
    total_empty: int = 0
    total_quarantined: int = 0
    total_duplicates: int = 0
    total_trade_tables: int = 0
    total_trade_rows: int = 0
    quarantined_files: list[dict[str, str]] = Field(default_factory=list)
    checksum_mismatches: list[str] = Field(default_factory=list)
    map_files_quarantined: list[str] = Field(default_factory=list)
    ingested_at: datetime = Field(default_factory=lambda: datetime.now())
