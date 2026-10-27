from __future__ import annotations
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env", override=True)

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_ENV: str = "development"
    API_PREFIX: str = "/api/v1"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,*"
    MAX_UPLOAD_MB: int = 100
    REQUEST_TIMEOUT_SECONDS: int = 60

    # Firebase
    FIREBASE_PROJECT_ID: str = Field(default="hydrate-d75d6")
    FIREBASE_SERVICE_ACCOUNT_PATH: str = Field(default="Secrets/firebase-service-account.json")
    FIREBASE_STORAGE_BUCKET: str = ""

    # LLM Models & Providers
    LLM_PROVIDER: str = "anthropic"  # primary: anthropic (fallback: groq, openai, gemini)
    LLM_MODEL: str = "claude-3-5-sonnet-latest"
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_API_KEY: str = ""
    LLM_MAX_OUTPUT_TOKENS: int = 6000
    LLM_ATTEMPTS_PER_PROVIDER: int = 2

    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_API_KEY1: str = ""
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-latest"

    GROQ_API_KEY: str = ""
    GROQ_API_KEY1: str = ""
    GROQ_API_KEY2: str = ""
    GROQ_API_KEY3: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-20b"

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4.1-mini"

    # Embedding
    EMBEDDING_PROVIDER: str = "local"  # local, openai, hashing-768
    EMBEDDING_MODEL: str = "hashing-768"
    EMBEDDING_API_KEY: str = ""

    # Trial Engine Limits (Hard boundaries)
    MAX_RUNS: int = 3
    MIN_DEMO_RUNS: int = 2
    MAX_TRIAL_ROUNDS_PER_RUN: int = 2
    MAX_SEARCHES_PER_AGENT_PER_RUN: int = 6
    MAX_RESULTS_PER_SEARCH: int = 10
    MAX_DEFENCE_SEARCHES: int = 2
    MAX_TOOL_RETRIES: int = 2
    MAX_CONTEXT_CHUNKS: int = 12

    # Map restriction
    RESTRICTED_MAP_FILENAMES: list[str] = ["runemark_map.png", "runemark_map.jpg", "runemark_map.webp"]

settings = Settings()
