from __future__ import annotations
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Literal
from google.cloud import firestore
from pydantic import BaseModel, ConfigDict, Field
from app.repositories.firebase import fs_retry

ALLOWED_AGENT_NAMES = frozenset({"heimdall", "thor", "loki", "odin"})

class MemoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    memory_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent: Literal["heimdall", "thor", "loki", "odin"]
    kind: str  # e.g., "verification_lesson", "high_exposure_pattern", "substitution_pattern", "ruling_note"
    content: str
    tags: list[str] = Field(default_factory=list)
    case_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AgentMemoryRepository(ABC):
    @abstractmethod
    async def recent(self, *, limit: int = 12) -> list[MemoryItem]: ...
    @abstractmethod
    async def write(self, item: MemoryItem) -> None: ...

class FirestoreAgentMemoryRepository(AgentMemoryRepository):
    """Enforces strictly private isolation per agent namespace."""
    def __init__(self, db: firestore.Client, agent_name: str):
        normalized = agent_name.strip().lower()
        if normalized not in ALLOWED_AGENT_NAMES:
            raise ValueError(f"Unauthorized agent memory namespace: {agent_name}")
        self.db = db
        self.agent_name = normalized

    @property
    def col(self):
        return self.db.collection("agent_memories").document(self.agent_name).collection("items")

    async def recent(self, *, limit: int = 12) -> list[MemoryItem]:
        safe_limit = max(1, min(limit, 50))
        def op():
            snaps = self.col.order_by("created_at", direction=firestore.Query.DESCENDING).limit(safe_limit).stream()
            return [s.to_dict() for s in snaps]
        rows = await fs_retry(op)
        return [MemoryItem.model_validate(r) for r in rows]

    async def write(self, item: MemoryItem) -> None:
        if item.agent != self.agent_name:
            raise PermissionError(f"Agent {self.agent_name} cannot write into {item.agent} memory!")
        data = item.model_dump(mode="json")
        data["created_at"] = item.created_at
        await fs_retry(lambda: self.col.document(item.memory_id).set(data))
