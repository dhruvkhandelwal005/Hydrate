import pytest
from app.repositories.memories import FirestoreAgentMemoryRepository, MemoryItem

def test_unauthorized_agent_name_rejected():
    with pytest.raises(ValueError):
        FirestoreAgentMemoryRepository(None, "supervisor_agent")

    with pytest.raises(ValueError):
        FirestoreAgentMemoryRepository(None, "manager_agent")

def test_memory_agent_write_isolation():
    # Simulate writing into another agent's memory
    repo = FirestoreAgentMemoryRepository(None, "thor")
    wrong_item = MemoryItem(
        agent="loki",
        kind="test",
        content="Sneaking into Thor memory"
    )
    with pytest.raises(PermissionError):
        # Even without DB call, memory validation prevents agent cross-pollution
        import asyncio
        asyncio.run(repo.write(wrong_item))
