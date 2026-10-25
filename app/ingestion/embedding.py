from __future__ import annotations
import hashlib
import math
from abc import ABC, abstractmethod
from typing import Any
from app.config import settings
from app.utils.text import tokenize

class EmbeddingProvider(ABC):
    @abstractmethod
    async def embed(self, text: str) -> list[float]: ...

class LocalHashingEmbedder(EmbeddingProvider):
    """
    Deterministic feature hashing embedding (dim=128 or 768).
    Runs with zero external network dependencies and sub-millisecond latency.
    """
    def __init__(self, dim: int = 128):
        self.dim = dim

    async def embed(self, text: str) -> list[float]:
        tokens = tokenize(text)
        if not tokens:
            return [0.0] * self.dim
        vec = [0.0] * self.dim
        for token in tokens:
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            idx = h % self.dim
            sign = 1.0 if (h // self.dim) % 2 == 0 else -1.0
            vec[idx] += sign

        # L2 normalize
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [x / norm for x in vec]
        return vec

class OpenAIEmbedder(EmbeddingProvider):
    def __init__(self, api_key: str, model: str = "text-embedding-3-small"):
        self.api_key = api_key
        self.model = model

    async def embed(self, text: str) -> list[float]:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=self.api_key)
        resp = await client.embeddings.create(model=self.model, input=text[:8000])
        return list(resp.data[0].embedding)

def get_embedder() -> EmbeddingProvider:
    if settings.EMBEDDING_PROVIDER == "openai" and (settings.OPENAI_API_KEY or settings.LLM_API_KEY):
        return OpenAIEmbedder(api_key=settings.OPENAI_API_KEY or settings.LLM_API_KEY, model=settings.EMBEDDING_MODEL)
    return LocalHashingEmbedder(dim=128)

class VectorRepository(ABC):
    @abstractmethod
    async def store_vector(self, item_id: str, vector: list[float], metadata: dict[str, Any]) -> None: ...
    @abstractmethod
    async def search_similar(self, query_vector: list[float], top_k: int = 10) -> list[tuple[str, float]]: ...

class InMemoryVectorRepository(VectorRepository):
    def __init__(self):
        self._vectors: dict[str, tuple[list[float], dict[str, Any]]] = {}

    async def store_vector(self, item_id: str, vector: list[float], metadata: dict[str, Any]) -> None:
        self._vectors[item_id] = (vector, metadata)

    async def search_similar(self, query_vector: list[float], top_k: int = 10) -> list[tuple[str, float]]:
        scores: list[tuple[str, float]] = []
        for item_id, (vec, _) in self._vectors.items():
            sim = cosine_sim(query_vector, vec)
            scores.append((item_id, sim))
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]

def cosine_sim(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0
