from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends
from app.models.case import CaseFile, CaseCreateRequest, CaseRunRequest
from app.evidence.graph import EvidenceGraph
from app.services.container import get_container, Container
from app.services.case_service import CaseService

router = APIRouter(prefix="/cases", tags=["Cases"])

import uuid
import asyncio
import logging

log = logging.getLogger("ragnarok.cases_api")

@router.post("", status_code=201)
async def create_case(
    req: CaseCreateRequest,
    background: bool = False,
    container: Container = Depends(get_container)
):
    service = CaseService(container)
    if background:
        case_id = str(uuid.uuid4())
        asyncio.create_task(
            container.trial_engine.execute_trial(
                question=req.question,
                pack_id=req.pack_id,
                as_of_date=req.as_of_date,
                case_id=case_id
            )
        )
        return {
            "case_id": case_id,
            "status": "RUNNING",
            "message": "Trial launched asynchronously in courtroom. Follow live SSE feed at stream_url.",
            "stream_url": f"/api/v1/cases/{case_id}/stream",
            "case_url": f"/api/v1/cases/{case_id}"
        }

    try:
        result = await service.create_and_run_case(req)
        return result
    except Exception as exc:
        log.error("Error executing case trial: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": str(exc),
                "error_type": type(exc).__name__,
                "suggestion": "Run with ?background=true for non-blocking trial streaming or check LLM credentials."
            }
        )

@router.post("/{case_id}/run")
async def rerun_case(case_id: str, req: CaseRunRequest, container: Container = Depends(get_container)):
    service = CaseService(container)
    case = await service.get_case(case_id)
    if not case:
        raise HTTPException(404, f"Case {case_id} not found")
    if case.run_number >= container.limits.max_runs:
        raise HTTPException(409, f"Max runs ({container.limits.max_runs}) already reached for this case")

    # Run trial engine continuation
    case_file, review, briefing = await container.trial_engine.execute_trial(
        question=case.question,
        pack_id=case.pack_id,
        as_of_date=case.as_of_date,
        case_id=case_id
    )
    return {
        "case": case_file.model_dump(mode="json"),
        "review": review.model_dump(mode="json"),
        "briefing": briefing.model_dump(mode="json") if briefing else None
    }

@router.get("/{case_id}")
async def get_case_endpoint(case_id: str, container: Container = Depends(get_container)):
    service = CaseService(container)
    case = await service.get_case(case_id)
    if not case:
        raise HTTPException(404, f"Case {case_id} not found")
    return case.model_dump(mode="json")

@router.get("/{case_id}/trace")
async def get_trace_endpoint(case_id: str, container: Container = Depends(get_container)):
    service = CaseService(container)
    traces = await service.get_traces(case_id)
    return {"case_id": case_id, "events": traces}

@router.get("/{case_id}/graph")
async def get_case_evidence_graph(case_id: str, container: Container = Depends(get_container)):
    service = CaseService(container)
    case = await service.get_case(case_id)
    if not case:
        raise HTTPException(404, f"Case {case_id} not found")

    claims = await container.case_repo.get_claims(case_id)
    challenges = await container.case_repo.get_challenges(case_id)
    rulings = await container.case_repo.get_rulings(case_id)

    # Build graph
    g = EvidenceGraph()
    # Event Node
    g.add_node(case.event_id, "EVENT", case.event_hypothesis)

    # Country & Sector Nodes
    for c in case.countries:
        g.add_node(f"country_{c}", "COUNTRY", c)
        g.add_edge(case.event_id, f"country_{c}", "AFFECTS")

    for s in case.sectors:
        g.add_node(f"sector_{s}", "SECTOR", s)

    # Document Nodes
    for ev in case.verification_evidence:
        g.add_node(ev.source_id, "DOCUMENT", ev.title or ev.source_id, reliability=ev.reliability.value)
        g.add_edge(ev.source_id, case.event_id, "SUPPORTS")

    # Claim Nodes
    for cl in claims:
        g.add_node(cl.claim_id, "CLAIM", cl.claim[:50] + "...", agent=cl.agent, nature=cl.nature.value, status=cl.status.value)
        g.add_edge(cl.claim_id, f"country_{cl.country}", "COVERS")
        for src in cl.evidence_ids:
            g.add_edge(cl.claim_id, src.split(":")[0], "DERIVED_FROM")

    # Challenge Edges
    for ch in challenges:
        g.add_node(ch.challenge_id, "CHALLENGE", ch.challenge_text[:50] + "...", attacker=ch.attacker)
        g.add_edge(ch.challenge_id, ch.target_claim_id, "CHALLENGES")

    # Ruling Nodes
    for r in rulings:
        g.add_node(r.ruling_id, "RULING", f"Verdict: {r.verdict.value}", verdict=r.verdict.value)
        g.add_edge(r.ruling_id, r.claim_id, "RULED_AS")

    return g.to_cytoscape()
