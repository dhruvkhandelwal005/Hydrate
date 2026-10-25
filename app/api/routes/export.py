from __future__ import annotations
import io
import json
import zipfile
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from app.services.container import get_container, Container
from app.services.case_service import CaseService

router = APIRouter(prefix="/cases", tags=["Export"])

@router.get("/{case_id}/export")
async def export_reproducibility_bundle(case_id: str, container: Container = Depends(get_container)):
    service = CaseService(container)
    case = await service.get_case(case_id)
    if not case:
        raise HTTPException(404, f"Case {case_id} not found")

    traces = await service.get_traces(case_id)
    claims = await container.case_repo.get_claims(case_id)
    challenges = await container.case_repo.get_challenges(case_id)
    rulings = await container.case_repo.get_rulings(case_id)
    briefing = await service.get_briefing(case_id)
    pack_report = await container.doc_repo.get_pack(case.pack_id)

    # In-memory ZIP construction
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. case_file.json
        zf.writestr("case_file.json", json.dumps(case.model_dump(mode="json"), indent=2))

        # 2. ingestion_report.json
        ingest_data = pack_report.model_dump(mode="json") if pack_report else {"pack_id": case.pack_id}
        zf.writestr("ingestion_report.json", json.dumps(ingest_data, indent=2))

        # 3. trace.jsonl
        trace_lines = "\n".join(json.dumps(t) for t in traces)
        zf.writestr("trace.jsonl", trace_lines)

        # 4. queries.json
        zf.writestr("queries.json", json.dumps(case.query_history, indent=2))

        # 5. claims.json
        zf.writestr("claims.json", json.dumps([c.model_dump(mode="json") for c in claims], indent=2))

        # 6. challenges.json
        zf.writestr("challenges.json", json.dumps([ch.model_dump(mode="json") for ch in challenges], indent=2))

        # 7. rulings.json
        zf.writestr("rulings.json", json.dumps([r.model_dump(mode="json") for r in rulings], indent=2))

        # 8. exposure.json
        exp_data = [e.model_dump(mode="json") for e in briefing.exposure_matrix] if briefing else []
        zf.writestr("exposure.json", json.dumps(exp_data, indent=2))

        # 9. briefing.md
        zf.writestr("briefing.md", briefing.rendered_markdown if briefing else "# No briefing rendered")

        # 10. source_manifest.json
        zf.writestr("source_manifest.json", json.dumps(case.verification_evidence, default=str, indent=2))

        # 11. config_snapshot.json
        from app.config import settings
        config_snapshot = {
            "APP_ENV": settings.APP_ENV,
            "MAX_RUNS": settings.MAX_RUNS,
            "MIN_DEMO_RUNS": settings.MIN_DEMO_RUNS,
            "MAX_SEARCHES_PER_AGENT_PER_RUN": settings.MAX_SEARCHES_PER_AGENT_PER_RUN,
            "LLM_PROVIDER": settings.LLM_PROVIDER,
            "EMBEDDING_PROVIDER": settings.EMBEDDING_PROVIDER
        }
        zf.writestr("config_snapshot.json", json.dumps(config_snapshot, indent=2))

    zip_buffer.seek(0)
    filename = f"reproducibility_bundle_{case_id[:8]}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
