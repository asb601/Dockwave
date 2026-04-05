"""LLM usage & cost summary endpoint.

Reads the llm_costs.jsonl log file and returns aggregated spend
broken down by caller, model, and time period.
"""
from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query

from app.util.auth import verify_service_token

router = APIRouter()

_COST_LOG = os.getenv(
    "LLM_COST_LOG_PATH",
    str(Path(__file__).parent.parent.parent / "logs" / "llm_costs.jsonl"),
)


def _read_entries(since: datetime | None = None) -> List[Dict[str, Any]]:
    """Read cost log entries, optionally filtered by timestamp."""
    path = Path(_COST_LOG)
    if not path.exists():
        return []
    entries: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if since:
                ts = entry.get("ts", "")
                try:
                    entry_time = datetime.fromisoformat(ts)
                    if entry_time < since:
                        continue
                except (ValueError, TypeError):
                    continue
            entries.append(entry)
    return entries


@router.get(
    "/summary",
    dependencies=[Depends(verify_service_token)],
    summary="LLM usage & cost summary",
)
async def usage_summary(
    period: str = Query(
        "all",
        description="Time period: 'today', '7d', '30d', or 'all'",
    ),
) -> Dict[str, Any]:
    """Return aggregated LLM usage and cost data."""
    now = datetime.now(timezone.utc)
    since = None
    if period == "today":
        since = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "7d":
        since = now - timedelta(days=7)
    elif period == "30d":
        since = now - timedelta(days=30)

    entries = _read_entries(since)

    # Aggregations
    total_cost = 0.0
    total_prompt = 0
    total_completion = 0
    total_calls = len(entries)

    by_caller: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0}
    )
    by_model: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0}
    )

    for e in entries:
        cost = e.get("cost_usd", 0.0) or 0.0
        pt = e.get("prompt_tokens", 0) or 0
        ct = e.get("completion_tokens", 0) or 0
        caller = e.get("caller", "unknown")
        model = e.get("model", "unknown")

        total_cost += cost
        total_prompt += pt
        total_completion += ct

        by_caller[caller]["calls"] += 1
        by_caller[caller]["prompt_tokens"] += pt
        by_caller[caller]["completion_tokens"] += ct
        by_caller[caller]["cost_usd"] += cost

        by_model[model]["calls"] += 1
        by_model[model]["prompt_tokens"] += pt
        by_model[model]["completion_tokens"] += ct
        by_model[model]["cost_usd"] += cost

    # Round costs for readability
    for v in by_caller.values():
        v["cost_usd"] = round(v["cost_usd"], 6)
    for v in by_model.values():
        v["cost_usd"] = round(v["cost_usd"], 6)

    return {
        "period": period,
        "total_calls": total_calls,
        "total_prompt_tokens": total_prompt,
        "total_completion_tokens": total_completion,
        "total_tokens": total_prompt + total_completion,
        "total_cost_usd": round(total_cost, 6),
        "by_caller": dict(by_caller),
        "by_model": dict(by_model),
    }
