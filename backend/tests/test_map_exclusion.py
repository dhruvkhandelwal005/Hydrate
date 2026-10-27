import pytest
from pathlib import Path
from app.ingestion.sanitizer import is_restricted_map

def test_map_file_strictly_identified_and_excluded():
    forbidden_files = [
        "runemark_map.png",
        "RUNEMARK_MAP.PNG",
        "/path/to/dev_pack_E5/runemark_map.png",
        "world_map.jpg",
        "runemark_sea_map.webp"
    ]
    for f in forbidden_files:
        assert is_restricted_map(f) is True, f"Failed to restrict map file: {f}"

def test_regular_text_documents_not_excluded():
    valid_files = [
        "ATL-0001.pdf",
        "ORV-0009.txt",
        "ORV-0014.docx",
        "WLD-0021.pdf"
    ]
    for f in valid_files:
        assert is_restricted_map(f) is False, f"Regular document falsely restricted: {f}"
