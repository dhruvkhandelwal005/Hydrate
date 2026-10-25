import pytest
from datetime import date
from app.utils.dates import is_admissible
from app.retrieval.metadata_filters import SearchFilters

def test_simulated_clock_admissibility():
    as_of = date(2027, 1, 25)

    # Document published on or before as-of is admissible
    assert is_admissible(date(2027, 1, 10), as_of) is True
    assert is_admissible(date(2027, 1, 25), as_of) is True

    # Document published after as-of is strictly inadmissible
    assert is_admissible(date(2027, 1, 26), as_of) is False
    assert is_admissible(date(2027, 2, 1), as_of) is False
    assert is_admissible(None, as_of) is False

def test_search_filters_clock_firewall():
    as_of = date(2027, 1, 25)
    filters = SearchFilters(pack_id="dev_pack_E5", as_of_date=as_of)
    assert filters.as_of_date == date(2027, 1, 25)
