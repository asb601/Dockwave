from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, List, Optional

logger = logging.getLogger("intellidoc.llm_config")

try:
    import openai  # type: ignore
    from openai import AzureOpenAI, OpenAI  # type: ignore
except ImportError:  # pragma: no cover
    openai = None  # type: ignore
    AzureOpenAI = None  # type: ignore
    OpenAI = None  # type: ignore


@dataclass
class LLMClientConfig:
    client: Any
    provider: str
    model: str


def build_llm_client(default_model: str) -> Optional[LLMClientConfig]:
    """Return the first configured LLM client in priority order.

    Priority:
      1. Azure OpenAI (`AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_API_BASE`)
      2. OpenAI (`OPENAI_API_KEY`)
      3. Groq (`GROQ_API_KEY`) — fallback
    """
    chain = build_llm_chain(default_model)
    return chain[0] if chain else None


def build_llm_chain(default_model: str) -> List[LLMClientConfig]:
    """Return ALL configured LLM clients in priority order for runtime fallback.

    If the primary provider hits a rate-limit or timeout at runtime,
    callers can iterate to the next client in the chain.
    """
    if openai is None:
        logger.warning("openai package not installed")
        return []

    chain: List[LLMClientConfig] = []

    # ── 1. Azure OpenAI (primary) ────────────────────────────
    azure_key = os.getenv("AZURE_OPENAI_API_KEY")
    azure_base = os.getenv("AZURE_OPENAI_API_BASE")
    if azure_key and azure_base and AzureOpenAI is not None:
        try:
            client = AzureOpenAI(
                api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-05-01-preview"),
                azure_endpoint=azure_base.rstrip("/"),
                api_key=azure_key,
            )
            chain.append(LLMClientConfig(
                client=client,
                provider="azure-openai",
                model=os.getenv("AZURE_OPENAI_MODEL", "gpt-4o-mini"),
            ))
        except Exception:
            logger.exception("Failed to init AzureOpenAI client")

    # ── 2. OpenAI (secondary) ────────────────────────────────
    public_key = os.getenv("OPENAI_API_KEY")
    if public_key and OpenAI is not None:
        try:
            client = OpenAI(api_key=public_key)
            chain.append(LLMClientConfig(
                client=client,
                provider="openai",
                model=os.getenv("OPENAI_MODEL", default_model),
            ))
        except Exception:
            logger.exception("Failed to init OpenAI client")

    # ── 3. Groq (fallback) ───────────────────────────────────
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key and OpenAI is not None:
        groq_base = (os.getenv("GROQ_BASE_URL") or "https://api.groq.com/openai/v1").rstrip("/")
        primary_model = os.getenv("GROQ_MODEL", default_model)
        fallback_model = os.getenv("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant")
        try:
            client = OpenAI(api_key=groq_key, base_url=groq_base)
            chain.append(LLMClientConfig(
                client=client,
                provider="groq",
                model=primary_model,
            ))
        except Exception:
            logger.exception("Failed to init Groq client")
        if fallback_model and fallback_model != primary_model:
            try:
                fb_client = OpenAI(api_key=groq_key, base_url=groq_base)
                chain.append(LLMClientConfig(
                    client=fb_client,
                    provider="groq-fallback",
                    model=fallback_model,
                ))
            except Exception:
                logger.exception("Failed to init Groq fallback client")

    return chain