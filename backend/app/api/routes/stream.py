from __future__ import annotations
import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import StreamingResponse
from app.services.container import get_container, Container
from app.models.trace import TraceEvent

router = APIRouter(prefix="/cases", tags=["Live Stream"])

@router.get("/{case_id}/stream")
async def stream_trial_events(
    case_id: str,
    request: Request,
    last_event_id: str | None = Header(None, alias="Last-Event-ID"),
    replay: bool = Query(False),
    container: Container = Depends(get_container)
):
    saved_events = await container.trace_repo.get_events_for_case(case_id)

    async def event_generator():
        sent_ids = set()

        # 1. If replay=true or Last-Event-ID present, replay saved events first
        if replay:
            for ev in saved_events:
                evt_id = getattr(ev, "trace_id", "evt_000")
                ts_str = ev.timestamp.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z" if isinstance(ev.timestamp, datetime) else str(ev.timestamp)
                payload = dict(ev.payload)
                if "ts" not in payload:
                    payload["ts"] = ts_str
                envelope = {
                    "id": evt_id,
                    "case_id": ev.case_id,
                    "run_id": ev.run_id,
                    "agent": ev.agent,
                    "ts": ts_str,
                    "type": ev.event_type,
                    "payload": payload
                }
                yield f"id: {evt_id}\nevent: {ev.event_type}\ndata: {json.dumps(envelope)}\n\n"
                sent_ids.add(evt_id)
                await asyncio.sleep(0.05)
            return

        if last_event_id:
            # Replay events starting after last_event_id
            start_emitting = False
            for ev in saved_events:
                evt_id = getattr(ev, "trace_id", "evt_000")
                if start_emitting:
                    ts_str = ev.timestamp.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z" if isinstance(ev.timestamp, datetime) else str(ev.timestamp)
                    payload = dict(ev.payload)
                    if "ts" not in payload:
                        payload["ts"] = ts_str
                    envelope = {
                        "id": evt_id,
                        "case_id": ev.case_id,
                        "run_id": ev.run_id,
                        "agent": ev.agent,
                        "ts": ts_str,
                        "type": ev.event_type,
                        "payload": payload
                    }
                    yield f"id: {evt_id}\nevent: {ev.event_type}\ndata: {json.dumps(envelope)}\n\n"
                    sent_ids.add(evt_id)
                elif evt_id == last_event_id:
                    start_emitting = True

        # 2. Live streaming from trace sink queue
        queue = container.trace_sink.subscribe(case_id)
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event: TraceEvent = await asyncio.wait_for(queue.get(), timeout=15.0)
                    evt_id = getattr(event, "trace_id", "evt_000")
                    if evt_id in sent_ids:
                        continue
                    ts_str = event.timestamp.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z" if isinstance(event.timestamp, datetime) else str(event.timestamp)
                    payload = dict(event.payload)
                    if "ts" not in payload:
                        payload["ts"] = ts_str
                    envelope = {
                        "id": evt_id,
                        "case_id": event.case_id,
                        "run_id": event.run_id,
                        "agent": event.agent,
                        "ts": ts_str,
                        "type": event.event_type,
                        "payload": payload
                    }
                    yield f"id: {evt_id}\nevent: {event.event_type}\ndata: {json.dumps(envelope)}\n\n"
                    sent_ids.add(evt_id)
                    if event.event_type in ("TRIAL_COMPLETED", "TRIAL_ABORTED"):
                        break
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            container.trace_sink.unsubscribe(case_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
