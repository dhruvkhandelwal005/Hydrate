from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

class TraceEventType(str, Enum):
    CASE_CREATED = "CASE_CREATED"
    PACK_INGESTED = "PACK_INGESTED"
    DOCUMENT_PARSED = "DOCUMENT_PARSED"
    DOCUMENT_QUARANTINED = "DOCUMENT_QUARANTINED"
    MEMORY_READ = "MEMORY_READ"
    MEMORY_WRITE = "MEMORY_WRITE"
    MEMORY_INFLUENCE = "MEMORY_INFLUENCE"
    SEARCH_STARTED = "SEARCH_STARTED"
    SEARCH_RESULTS = "SEARCH_RESULTS"
    SOURCE_REJECTED = "SOURCE_REJECTED"
    CLOCK_VIOLATION = "CLOCK_VIOLATION"
    CLAIM_CREATED = "CLAIM_CREATED"
    CALCULATION = "CALCULATION"
    CHALLENGE_CREATED = "CHALLENGE_CREATED"
    DEFENCE_CREATED = "DEFENCE_CREATED"
    CLAIM_CONCEDED = "CLAIM_CONCEDED"
    RULING_CREATED = "RULING_CREATED"
    SUFFICIENCY_FAILED = "SUFFICIENCY_FAILED"
    RETRIAL_STARTED = "RETRIAL_STARTED"
    BRIEFING_CREATED = "BRIEFING_CREATED"
    LIMIT_REACHED = "LIMIT_REACHED"
    TOOL_FAILURE = "TOOL_FAILURE"
    DUPLICATE_QUERY_BLOCKED = "DUPLICATE_QUERY_BLOCKED"

class TraceEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    trace_id: str
    case_id: str
    run_id: str
    agent: str  # "controller", "heimdall", "thor", "loki", "odin"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
