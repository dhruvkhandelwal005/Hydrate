"""Production structured-output LLM providers with deterministic fallback.
Order defaults to Anthropic -> Gemini -> Groq -> OpenAI.
No provider performs agent reasoning beyond the prompt it is given.
"""
from __future__ import annotations
import asyncio, json, logging, os
from dataclasses import dataclass
from typing import Any
from pydantic import BaseModel, ValidationError
from Heimdall import LLMProvider

log = logging.getLogger("ragnarok.llm")

@dataclass(frozen=True)
class ProviderInfo:
    name: str
    model: str

class ProviderFailure(RuntimeError): pass

class AnthropicProvider(LLMProvider):
    def __init__(self):
        from anthropic import AsyncAnthropic
        self.model=os.getenv("ANTHROPIC_MODEL","claude-sonnet-4-5")
        self.client=AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    async def structured(self, *, system:str, user:str, schema:type[BaseModel])->BaseModel:
        r=await self.client.messages.create(model=self.model,max_tokens=int(os.getenv("LLM_MAX_OUTPUT_TOKENS","6000")),system=system,messages=[{"role":"user","content":user}],output_config={"format":{"type":"json_schema","schema":schema.model_json_schema()}})
        text=next((b.text for b in r.content if getattr(b,"type",None)=="text"),None)
        if not text: raise ProviderFailure("Anthropic returned no text block")
        return schema.model_validate_json(text)

class GeminiProvider(LLMProvider):
    def __init__(self):
        from google import genai
        self.model=os.getenv("GEMINI_MODEL","gemini-2.5-flash")
        self.client=genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    async def structured(self, *, system:str, user:str, schema:type[BaseModel])->BaseModel:
        from google.genai import types
        def call():
            return self.client.models.generate_content(model=self.model,contents=user,config=types.GenerateContentConfig(system_instruction=system,response_mime_type="application/json",response_schema=schema,temperature=0.1))
        r=await asyncio.to_thread(call)
        if getattr(r,"parsed",None) is not None:
            return r.parsed if isinstance(r.parsed,schema) else schema.model_validate(r.parsed)
        return schema.model_validate_json(r.text)

class GroqProvider(LLMProvider):
    def __init__(self):
        from groq import AsyncGroq
        self.model=os.getenv("GROQ_MODEL","openai/gpt-oss-20b")
        self.client=AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
    async def structured(self, *, system:str, user:str, schema:type[BaseModel])->BaseModel:
        r=await self.client.chat.completions.create(model=self.model,messages=[{"role":"system","content":system},{"role":"user","content":user}],response_format={"type":"json_schema","json_schema":{"name":schema.__name__,"strict":False,"schema":schema.model_json_schema()}},temperature=0.1)
        content=r.choices[0].message.content
        if not content: raise ProviderFailure("Groq returned empty content")
        return schema.model_validate_json(content)

class OpenAIProvider(LLMProvider):
    def __init__(self):
        from openai import AsyncOpenAI
        self.model=os.getenv("OPENAI_MODEL",os.getenv("LLM_MODEL","gpt-4.1-mini"))
        self.client=AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY"),base_url=os.getenv("OPENAI_BASE_URL") or None)
    async def structured(self, *, system:str, user:str, schema:type[BaseModel])->BaseModel:
        r=await self.client.responses.parse(model=self.model,input=[{"role":"system","content":system},{"role":"user","content":user}],text_format=schema)
        if r.output_parsed is None: raise ProviderFailure("OpenAI returned no structured object")
        return r.output_parsed

class FallbackLLMProvider(LLMProvider):
    """Bounded failover. Same prompt/schema is retried on the next configured vendor."""
    def __init__(self, providers:list[tuple[str,LLMProvider]], attempts_per_provider:int=1):
        if not providers: raise RuntimeError("No LLM provider API key configured")
        self.providers=providers; self.attempts_per_provider=max(1,attempts_per_provider)
        self.last_provider: ProviderInfo|None=None
    async def structured(self, *, system:str, user:str, schema:type[BaseModel])->BaseModel:
        failures=[]
        for name,p in self.providers:
            for attempt in range(self.attempts_per_provider):
                try:
                    result=await p.structured(system=system,user=user,schema=schema)
                    self.last_provider=ProviderInfo(name,getattr(p,"model","unknown"))
                    log.info(json.dumps({"event_type":"LLM_PROVIDER_SUCCESS","provider":name,"model":self.last_provider.model,"schema":schema.__name__}))
                    return result
                except Exception as exc:
                    failures.append(f"{name}:{type(exc).__name__}")
                    log.warning(json.dumps({"event_type":"LLM_PROVIDER_FAILURE","provider":name,"attempt":attempt+1,"error_type":type(exc).__name__}))
                    if attempt+1<self.attempts_per_provider: await asyncio.sleep(.25*(2**attempt))
        raise ProviderFailure("All configured LLM providers failed: "+", ".join(failures))

def build_fallback_llm()->FallbackLLMProvider:
    providers=[]
    constructors=[("anthropic","ANTHROPIC_API_KEY",AnthropicProvider),("gemini","GEMINI_API_KEY",GeminiProvider),("groq","GROQ_API_KEY",GroqProvider),("openai","OPENAI_API_KEY",OpenAIProvider)]
    for name,key,ctor in constructors:
        if os.getenv(key) or (name=="openai" and os.getenv("LLM_API_KEY")):
            try: providers.append((name,ctor()))
            except Exception as exc: log.warning("Provider %s unavailable at init: %s",name,type(exc).__name__)
    return FallbackLLMProvider(providers,attempts_per_provider=int(os.getenv("LLM_ATTEMPTS_PER_PROVIDER","1")))
