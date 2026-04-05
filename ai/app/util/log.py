"""Structured event logging utilities.

All JSONL files are written through Python's standard logging machinery so
that the RotatingFileHandler serialises writes correctly under concurrent
requests.  Callers never open files directly.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict


# ---------------------------------------------------------------------------
# Internal: one dedicated file-logger per JSONL sink
# ---------------------------------------------------------------------------

def _make_jsonl_logger(logger_name: str, file_path: str) -> logging.Logger:
    """Build (or return existing) a logger that writes raw JSON lines."""
    evlogger = logging.getLogger(logger_name)
    if evlogger.handlers:
        return evlogger
    evlogger.propagate = False
    evlogger.setLevel(logging.INFO)
    p = Path(file_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        p, maxBytes=10 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter("%(message)s"))
    evlogger.addHandler(handler)
    return evlogger


_EVENTS_PATH = os.getenv("LOG_JSONL_PATH", str(Path(__file__).parent.parent.parent / "logs" / "events.jsonl"))
_BRAIN_PATH = str(Path(__file__).parent.parent.parent / "logs" / "brain_event.jsonl")
_LLM_COST_PATH = str(Path(__file__).parent.parent.parent / "logs" / "llm_costs.jsonl")

_event_logger = _make_jsonl_logger("intellidoc.sink.events", _EVENTS_PATH)
_brain_logger = _make_jsonl_logger("intellidoc.sink.brain", _BRAIN_PATH)
_cost_logger = _make_jsonl_logger("intellidoc.sink.llm_costs", _LLM_COST_PATH)

_app_logger = logging.getLogger("intellidoc.costs")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def log_event(event_type: str, data: Dict[str, Any]) -> None:
    """Append a structured JSON event to the events JSONL file (best-effort)."""
    try:
        evt = {"ts": datetime.now(timezone.utc).isoformat(), "type": event_type, **data}
        _event_logger.info(json.dumps(evt, ensure_ascii=False))
    except Exception:
        pass


def log_brain_event(event_type: str, data: Dict[str, Any]) -> None:
    """Append a structured JSON event to the brain JSONL file (best-effort)."""
    try:
        evt = {"ts": datetime.now(timezone.utc).isoformat(), "type": event_type, **data}
        _brain_logger.info(json.dumps(evt, ensure_ascii=False))
    except Exception:
        pass


def log_llm_cost(
    caller: str,
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    **extra: Any,
) -> float:
    """Log an LLM call with cost to llm_costs.jsonl and return the cost.

    Args:
        caller: Which part of the system made this call (e.g. "brain", "entity_extraction", "router", "summarize", "stream").
        provider: LLM provider name (e.g. "azure_openai", "groq").
        model: Model/deployment name (e.g. "gpt-4o-mini").
        prompt_tokens: Input tokens used.
        completion_tokens: Output tokens generated.
        **extra: Any additional fields to include in the log entry.

    Returns:
        Estimated cost in USD.
    """
    cost = estimate_cost(prompt_tokens, completion_tokens, model=model)
    total_tokens = prompt_tokens + completion_tokens
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "caller": caller,
        "provider": provider,
        "model": model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "cost_usd": cost,
        **extra,
    }
    try:
        _cost_logger.info(json.dumps(entry, ensure_ascii=False))
    except Exception:
        pass
    _app_logger.info(
        "LLM cost | %-22s | %-14s | %-26s | in=%-6d out=%-6d | $%.6f",
        caller, provider, model, prompt_tokens, completion_tokens, cost,
    )
    return cost


# Per-1K-token pricing by provider and model (USD).
# Override via env vars like AZURE_OPENAI_GPT4O_MINI_INPUT_COST_PER_1K.
_PRICING: Dict[str, Dict[str, float]] = {
    # Azure OpenAI
    "gpt-4o-mini":       {"in": 0.000150, "out": 0.000600},
    "gpt-4o":            {"in": 0.00250,  "out": 0.01000},
    "gpt-4":             {"in": 0.03000,  "out": 0.06000},
    # Groq
    "llama-3.3-70b-versatile": {"in": 0.00059, "out": 0.00079},
    "llama-3.1-8b-instant":    {"in": 0.00005, "out": 0.00008},
    # OpenAI direct
    "gpt-3.5-turbo":    {"in": 0.00050,  "out": 0.00150},
}
_DEFAULT_PRICING = {"in": 0.000150, "out": 0.000600}  # gpt-4o-mini fallback


def estimate_cost(
    prompt_tokens: int,
    completion_tokens: int,
    model: str = "",
) -> float:
    """Estimate USD cost based on token counts and model name."""
    rates = _PRICING.get(model, _DEFAULT_PRICING)
    return (
        (prompt_tokens / 1000.0) * rates["in"]
        + (completion_tokens / 1000.0) * rates["out"]
    )
