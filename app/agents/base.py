from __future__ import annotations
import asyncio
import json
import logging
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, TypeVar
from pydantic import BaseModel
from app.config import settings
from app.models.trace import TraceEvent, TraceEventType
from app.observability.tracing import TraceSink
from app.repositories.memories import AgentMemoryRepository, MemoryItem
from app.retrieval.hybrid_search import SearchTool
from app.retrieval.query_registry import QueryRegistry
from app.utils.text import wrap_untrusted_evidence

log = logging.getLogger("ragnarok.agent")

T = TypeVar("T", bound=BaseModel)

class LLMProvider(ABC):
    @abstractmethod
    async def structured(self, *, system: str, user: str, schema: type[T]) -> T: ...

class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-latest"):
        from anthropic import AsyncAnthropic
        self.client = AsyncAnthropic(api_key=api_key)
        self.model = model

    async def structured(self, *, system: str, user: str, schema: type[T]) -> T:
        r = await self.client.messages.create(
            model=self.model,
            max_tokens=settings.LLM_MAX_OUTPUT_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"format": {"type": "json_schema", "schema": schema.model_json_schema()}}
        )
        text = next((b.text for b in r.content if getattr(b, "type", None) == "text"), None)
        if not text:
            raise RuntimeError("Anthropic returned empty content")
        return schema.model_validate_json(text)

class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-3.5-flash-lite"):
        from google import genai
        self.client = genai.Client(api_key=api_key)
        self.model = model
        self.fallback_models = ["gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.5-flash"]

    async def structured(self, *, system: str, user: str, schema: type[T]) -> T:
        from google.genai import types
        prompt_text = f"{user}\n\nRespond with strict JSON matching this schema:\n{json.dumps(schema.model_json_schema())}"
        
        models_to_try = [self.model] + [m for m in self.fallback_models if m != self.model]
        last_exc = None
        for m in models_to_try:
            try:
                def _call(model_name=m):
                    return self.client.models.generate_content(
                        model=model_name,
                        contents=prompt_text,
                        config=types.GenerateContentConfig(
                            system_instruction=system,
                            response_mime_type="application/json",
                            temperature=0.1
                        )
                    )
                r = await asyncio.to_thread(_call)
                text = r.text
                if not text:
                    continue
                return schema.model_validate_json(text)
            except Exception as e:
                last_exc = e
                log.warning("Gemini model %s failed: %s; trying next model", m, e)
                continue
        raise RuntimeError(f"All Gemini models exhausted: {last_exc}")

class GroqProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "openai/gpt-oss-120b"):
        from groq import AsyncGroq
        self.client = AsyncGroq(api_key=api_key)
        self.model = model
        self.fallback_models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "allam-2-7b"]

    async def structured(self, *, system: str, user: str, schema: type[T]) -> T:
        schema_json = json.dumps(schema.model_json_schema())
        safe_user = user if len(user) <= 6000 else user[:6000] + "\n[TRUNCATED_FOR_RATE_LIMITS]"
        prompt = f"{safe_user}\n\nRespond with strict JSON matching schema: {schema_json}"
        
        models_to_try = [self.model] + [m for m in self.fallback_models if m != self.model]
        last_exc = None
        for m in models_to_try:
            try:
                r = await self.client.chat.completions.create(
                    model=m,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    max_tokens=800,
                    temperature=0.1
                )
                content = r.choices[0].message.content
                if not content:
                    continue
                return schema.model_validate_json(content)
            except Exception as e:
                last_exc = e
                log.warning("Groq model %s failed: %s; trying next model", m, e)
                continue
        raise RuntimeError(f"All Groq models exhausted: {last_exc}")

class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4.1-mini", base_url: str | None = None):
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)
        self.model = model

    async def structured(self, *, system: str, user: str, schema: type[T]) -> T:
        r = await self.client.responses.parse(
            model=self.model,
            input=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            text_format=schema
        )
        if r.output_parsed is None:
            raise RuntimeError("OpenAI returned no structured output")
        return r.output_parsed

class FallbackLLMProvider(LLMProvider):
    def __init__(self, providers: list[tuple[str, LLMProvider]], attempts: int = 2):
        if not providers:
            raise RuntimeError("No LLM provider configured")
        self.providers = providers
        self.attempts = attempts

    async def structured(self, *, system: str, user: str, schema: type[T]) -> T:
        errors = []
        for name, p in self.providers:
            for attempt in range(self.attempts):
                try:
                    res = await p.structured(system=system, user=user, schema=schema)
                    return res
                except Exception as exc:
                    errors.append(f"{name}:{type(exc).__name__}:{exc}")
                    log.warning("Provider %s attempt %d failed: %s", name, attempt + 1, exc)
                    if attempt + 1 < self.attempts:
                        await asyncio.sleep(0.3 * (2 ** attempt))
        raise RuntimeError("All configured LLM providers failed: " + "; ".join(errors[:3]))

def get_llm_provider() -> LLMProvider:
    candidates: list[tuple[str, LLMProvider]] = []

    # Priority 1: Gemini (high token limit and fast structured JSON generation)
    if settings.GEMINI_API_KEY:
        try:
            candidates.append(("gemini", GeminiProvider(api_key=settings.GEMINI_API_KEY, model=settings.GEMINI_MODEL)))
        except Exception as e:
            log.warning("Could not init Gemini: %s", e)

    # Priority 2: Groq with robust multi-model fallback
    if settings.GROQ_API_KEY:
        try:
            candidates.append(("groq", GroqProvider(api_key=settings.GROQ_API_KEY, model=settings.GROQ_MODEL or "openai/gpt-oss-120b")))
        except Exception as e:
            log.warning("Could not init Groq: %s", e)

    # Priority 3: Anthropic
    if settings.ANTHROPIC_API_KEY:
        try:
            candidates.append(("anthropic", AnthropicProvider(api_key=settings.ANTHROPIC_API_KEY, model=settings.ANTHROPIC_MODEL)))
        except Exception as e:
            log.warning("Could not init Anthropic: %s", e)

    # Priority 4: OpenAI
    if settings.OPENAI_API_KEY or settings.LLM_API_KEY:
        try:
            candidates.append(("openai", OpenAIProvider(
                api_key=settings.OPENAI_API_KEY or settings.LLM_API_KEY,
                model=settings.OPENAI_MODEL,
                base_url=settings.LLM_BASE_URL
            )))
        except Exception as e:
            log.warning("Could not init OpenAI: %s", e)

    if not candidates:
        raise RuntimeError("No valid LLM provider credentials found in environment!")

    return FallbackLLMProvider(candidates, attempts=settings.LLM_ATTEMPTS_PER_PROVIDER)

class BaseAgent:
    def __init__(
        self,
        agent_name: str,
        system_prompt: str,
        llm: LLMProvider,
        search_tool: SearchTool,
        memory_repo: AgentMemoryRepository,
        trace_sink: TraceSink,
        query_registry: QueryRegistry | None = None
    ):
        self.agent_name = agent_name
        self.system_prompt = system_prompt
        self.llm = llm
        self.search_tool = search_tool
        self.memory_repo = memory_repo
        self.trace_sink = trace_sink
        self.query_registry = query_registry or QueryRegistry()

    async def emit_trace(self, case_id: str, run_id: str, event_type: str, **payload: Any) -> None:
        try:
            event = TraceEvent(
                trace_id=str(uuid.uuid4()),
                case_id=case_id,
                run_id=run_id,
                agent=self.agent_name,
                timestamp=datetime.now(timezone.utc),
                event_type=event_type,
                payload=payload
            )
            await self.trace_sink.emit(event)
        except Exception as e:
            log.warning("Trace emit error: %s", e)

    async def structured_call(self, user_prompt: str, schema: type[T], max_retries: int = 2) -> T:
        last_exc = None
        for i in range(max_retries + 1):
            try:
                return await self.llm.structured(system=self.system_prompt, user=user_prompt, schema=schema)
            except Exception as e:
                last_exc = e
                if i < max_retries:
                    await asyncio.sleep(0.3 * (2 ** i))
        raise RuntimeError(f"{self.agent_name} structured call failed: {last_exc}")
