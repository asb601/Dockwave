"""BrainAgent — DEPRECATED.

All orchestration is now handled by the LangGraph state machine in
``app.core.graph``.  Action handlers (create event, create task, notes)
live in ``app.agents.actions``.

This module is kept only as a thin re-export layer so nothing breaks if
a stale import references it.
"""
from __future__ import annotations

# Re-export the canonical _parse_llm_json for any legacy callers
from app.agents.actions import _parse_llm_json  # noqa: F401
