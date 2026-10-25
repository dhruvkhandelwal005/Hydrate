from __future__ import annotations
import asyncio
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import AsyncIterator
from app.models.trace import TraceEvent
from app.observability.logger import log_event

class TraceSink(ABC):
    @abstractmethod
    async def emit(self, event: TraceEvent) -> None: ...

class MultiTraceSink(TraceSink):
    """Broadcasts trace events to persistent storage and live SSE streaming queues."""
    def __init__(self, persistence_sink: TraceSink | None = None):
        self.persistence_sink = persistence_sink
        self._listeners: dict[str, list[asyncio.Queue[TraceEvent]]] = {}
        self._history: dict[str, list[TraceEvent]] = {}

    def subscribe(self, case_id: str) -> asyncio.Queue[TraceEvent]:
        q: asyncio.Queue[TraceEvent] = asyncio.Queue()
        self._listeners.setdefault(case_id, []).append(q)
        # Replay past events for this case
        for ev in self._history.get(case_id, []):
            q.put_nowait(ev)
        return q

    def unsubscribe(self, case_id: str, q: asyncio.Queue[TraceEvent]) -> None:
        if case_id in self._listeners and q in self._listeners[case_id]:
            self._listeners[case_id].remove(q)

    def get_events(self, case_id: str) -> list[TraceEvent]:
        return list(self._history.get(case_id, []))

    async def emit(self, event: TraceEvent) -> None:
        self._history.setdefault(event.case_id, []).append(event)
        log_event(event.event_type, event.agent, case_id=event.case_id, run_id=event.run_id, **event.payload)

        # Broadcast to active SSE listeners
        listeners = self._listeners.get(event.case_id, [])
        for q in list(listeners):
            try:
                q.put_nowait(event)
            except Exception:
                pass

        if self.persistence_sink:
            try:
                await self.persistence_sink.emit(event)
            except Exception as e:
                pass
