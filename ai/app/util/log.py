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


_EVENTS_PATH = os.getenv("LOG_JSONL_PATH", "ai/logs/events.jsonl")
_BRAIN_PATH = str(Path(__file__).parent.parent.parent / "logs" / "brain_event.jsonl")

_event_logger = _make_jsonl_logger("intellidoc.sink.events", _EVENTS_PATH)
_brain_logger = _make_jsonl_logger("intellidoc.sink.brain", _BRAIN_PATH)


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


def cost_config() -> Dict[str, float]:
    def _f(name: str, default: float) -> float:
        try:
            return float(os.getenv(name, str(default)))
        except Exception:
            return default

    return {
        "in_per_1k": _f(
            "GROQ_INPUT_COST_PER_1K",
            _f("AZURE_OPENAI_INPUT_COST_PER_1K", _f("OPENAI_INPUT_COST_PER_1K", 0.0)),
        ),
        "out_per_1k": _f(
            "GROQ_OUTPUT_COST_PER_1K",
            _f("AZURE_OPENAI_OUTPUT_COST_PER_1K", _f("OPENAI_OUTPUT_COST_PER_1K", 0.0)),
        ),
    }


def estimate_cost(prompt_tokens: int, completion_tokens: int) -> float:
    cfg = cost_config()
    return (
        (prompt_tokens / 1000.0) * cfg["in_per_1k"]
        + (completion_tokens / 1000.0) * cfg["out_per_1k"]
    )
