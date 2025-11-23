from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


def _log_path() -> Path:
    # Default logs directory under repo
    p = os.getenv("LOG_JSONL_PATH", "ai/logs/events.jsonl")
    path = Path(p)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def log_event(event_type: str, data: Dict[str, Any]) -> None:
    try:
        evt = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "type": event_type,
            **data,
        }
        line = json.dumps(evt, ensure_ascii=False)
        with _log_path().open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        # Best-effort logging; never raise
        pass


def cost_config() -> Dict[str, float]:
    # Read per-1K token costs from env. Prefer Azure-specific, then generic.
    def f(name: str, default: float) -> float:
        try:
            return float(os.getenv(name, default))
        except Exception:
            return default
    return {
        "in_per_1k": f("AZURE_OPENAI_INPUT_COST_PER_1K", f("OPENAI_INPUT_COST_PER_1K", 0.0)),
        "out_per_1k": f("AZURE_OPENAI_OUTPUT_COST_PER_1K", f("OPENAI_OUTPUT_COST_PER_1K", 0.0)),
    }


def estimate_cost(prompt_tokens: int, completion_tokens: int) -> float:
    cfg = cost_config()
    return (prompt_tokens / 1000.0) * cfg["in_per_1k"] + (completion_tokens / 1000.0) * cfg["out_per_1k"]


def log_brain_event(event_type: str, data: dict) -> None:
    # Always log to ai/logs/brain_event.jsonl relative to project root
    log_path = Path(__file__).parent.parent.parent / 'logs' / 'brain_event.jsonl'
    log_path.parent.mkdir(parents=True, exist_ok=True)
    evt = {"ts": datetime.now(timezone.utc).isoformat(), "type": event_type, **data}
    with log_path.open('a', encoding='utf-8') as f:
        f.write(json.dumps(evt, ensure_ascii=False) + '\n')
