from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Optional

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
      1. Groq (`GROQ_API_KEY`)
      2. Azure OpenAI (`AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_API_BASE`)
      3. OpenAI (`OPENAI_API_KEY`)
    """
    if openai is None:
        logger.warning("openai package not installed")
        return None

    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key and OpenAI is not None:
        try:
            client = OpenAI(
                api_key=groq_key,
                base_url=(os.getenv("GROQ_BASE_URL") or "https://api.groq.com/openai/v1").rstrip("/"),
            )
            return LLMClientConfig(
                client=client,
                provider="groq",
                model=os.getenv("GROQ_MODEL", default_model),
            )
        except Exception:
            logger.exception("Failed to init Groq client")

    azure_key = os.getenv("AZURE_OPENAI_API_KEY")
    azure_base = os.getenv("AZURE_OPENAI_API_BASE")
    if azure_key and azure_base and AzureOpenAI is not None:
        try:
            client = AzureOpenAI(
                api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-05-01-preview"),
                azure_endpoint=azure_base.rstrip("/"),
                api_key=azure_key,
            )
            return LLMClientConfig(
                client=client,
                provider="azure-openai",
                model=os.getenv("AZURE_OPENAI_MODEL", "gpt-4o-mini"),
            )
        except Exception:
            logger.exception("Failed to init AzureOpenAI client")

    public_key = os.getenv("OPENAI_API_KEY")
    if public_key and OpenAI is not None:
        try:
            client = OpenAI(api_key=public_key)
            return LLMClientConfig(
                client=client,
                provider="openai",
                model=os.getenv("OPENAI_MODEL", default_model),
            )
        except Exception:
            logger.exception("Failed to init OpenAI client")

    return None