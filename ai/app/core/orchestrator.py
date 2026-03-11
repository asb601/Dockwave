"""
AgentOrchestrator – manages the multi-tool execution pipeline.

Separates *routing* (which tools to invoke) from *invocation* (calling them),
so each concern can evolve independently and be tested in isolation.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict

from .tool_registry import ToolRegistry

logger = logging.getLogger("intellidoc.orchestrator")


class AgentOrchestrator:
    """
    Orchestrates tool selection and execution for the agent pipeline.

    The orchestrator delegates routing to the ``llm_router`` tool and
    delegates invocation to the tool registry, keeping BrainAgent focused
    on iterative RAG logic rather than plumbing.
    """

    def __init__(self, registry: ToolRegistry) -> None:
        self.registry = registry

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------

    async def route(self, goal: str) -> Dict[str, bool]:
        """
        Ask the LLM router which tools should be invoked.

        Falls back to ``{"graph_rag": True, "get_meetings": False}`` when
        the router is unavailable or returns an unparseable response.
        """
        router = self.registry.get("llm_router")
        if not router:
            logger.warning(
                "llm_router not registered; defaulting to graph_rag=True"
            )
            return {"graph_rag": True, "get_meetings": False}

        result = await router.run(question=goal)
        raw = result.get("answer", "{}")
        try:
            plan = json.loads(raw)
            if not isinstance(plan, dict):
                raise ValueError("routing plan is not a JSON object")
            return plan
        except Exception as exc:
            logger.warning(
                "Router returned invalid plan (%s); raw=%r – defaulting to graph_rag",
                exc,
                raw,
            )
            return {"graph_rag": True, "get_meetings": False}

    # ------------------------------------------------------------------
    # Invocation
    # ------------------------------------------------------------------

    async def execute(self, tool_name: str, **kwargs: Any) -> Dict[str, Any]:
        """
        Execute a registered tool by name.

        Returns an error dict when the tool is not found so callers can
        handle the failure gracefully rather than raising an exception.
        """
        tool = self.registry.get(tool_name)
        if tool is None:
            logger.error("Tool '%s' not found in registry", tool_name)
            return {"error": f"Tool '{tool_name}' is not registered"}
        try:
            return await tool.run(**kwargs)
        except Exception as exc:
            logger.exception("Tool '%s' raised an exception", tool_name)
            return {"error": str(exc), "tool": tool_name}
