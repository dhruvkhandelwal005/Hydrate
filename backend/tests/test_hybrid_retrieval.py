import pytest
from datetime import date
from app.retrieval.hybrid_search import FirestoreHybridSearch, SearchFilters
from app.ingestion.embedding import LocalHashingEmbedder

@pytest.mark.asyncio
async def test_hybrid_search_clock_and_filters():
    from app.services.container import get_container
    c = get_container()

    # Query with simulated clock firewall set to 2027-01-25
    filters = SearchFilters(
        pack_id="dev_pack_E5",
        as_of_date=date(2027, 1, 25),
        event_id="E5",
        country="Midgard",
        sector="Wheat"
    )

    results = await c.search_tool.search(query="Orvan corridor agreement wheat", filters=filters, limit=5)
    assert len(results) > 0
    for r in results:
        # Every retrieved source MUST satisfy the simulated clock boundary
        assert r.pub_date <= date(2027, 1, 25), f"CLOCK VIOLATION: {r.source_id} published on {r.pub_date}"
        assert r.status.upper() not in ("DAMAGED", "EMPTY", "QUARANTINED")

@pytest.mark.asyncio
async def test_background_docs_discoverable():
    from app.services.container import get_container
    c = get_container()

    # Query without country filter for atlas background documents
    filters = SearchFilters(
        pack_id="dev_pack_E5",
        as_of_date=date(2027, 1, 25),
        event_id="E5"
    )
    results = await c.search_tool.search(query="outlet credibility guide Tier 1 Tier 4", filters=filters, limit=5)
    assert len(results) > 0
    # ATL-0012 has EVENT_ID=NONE and should be discoverable
    assert any("ATL-" in r.source_id or "ORV-" in r.source_id for r in results)
