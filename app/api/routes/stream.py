from __future__ import annotations
import asyncio
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.services.container import get_container, Container
from app.models.trace import TraceEvent

router = APIRouter(prefix="/cases", tags=["Live Stream"])

@router.get("/{case_id}/stream")
async def stream_trial_events(case_id: str, container: Container = Depends(get_container)):
    queue = container.trace_sink.subscribe(case_id)

    async def event_generator():
        try:
            while True:
                # Wait for next courtroom trace event with timeout
                try:
                    event: TraceEvent = await asyncio.wait_for(queue.get(), timeout=25.0)
                    yield f"event: {event.event_type}\ndata: {event.model_dump_json()}\n\n"
                    if event.event_type in ("TRIAL_COMPLETED", "TRIAL_ABORTED"):
                        break
                except asyncio.TimeoutError:
                    # Send keep-alive ping
                    yield ": ping\n\n"
        finally:
            container.trace_sink.unsubscribe(case_id, queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
