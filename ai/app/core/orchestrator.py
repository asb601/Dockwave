"""
AgentOrchestrator -- multi-stage agentic pipeline.

The orchestrator owns the full lifecycle of a user query:

  1. **Route**  -- ask the LLM router which capabilities are needed
  2. **Plan**   -- build an ordered execution plan from the routing decision
  3. **Execute** -- run each planned step, collecting results
  4. **Synthesize** -- merge tool outputs into a single answer via LLM

Each stage is independently testable and can evolve without touching
the others.  BrainAgent delegates to this orchestrator instead of
manually checking plan flags.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .tool_registry import ToolRegistry

logger = logging.getLogger("intellidoc.orchestrator")


# -----------------------------------------------------------------------
# Data structures for the pipeline
# -----------------------------------------------------------------------

@dataclass
class Step:
    """A single step in the execution plan."""
    tool_name: str
    kwargs: Dict[str, Any] = field(default_factory=dict)
    parallel_group: int = 0  # steps in the same group run concurrently


@dataclass
class StepResult:
    """Outcome of executing one step."""
    tool_name: str
    output: Dict[str, Any]
    success: bool
    error: Optional[str] = None


@dataclass
class PipelineResult:
    """Full result of the orchestration pipeline."""
    routing_plan: Dict[str, bool]
    steps: List[Step]
    results: List[StepResult]


class AgentOrchestrator:
    """
    Orchestrates tool selection and execution for the agent pipeline.

    Flow:
        route(goal) -> plan(routing, context) -> execute(plan) -> results

    The orchestrator is tool-agnostic: it reads boolean flags from the
    router and maps them to registered tool names.  Adding a new tool only
    requires updating the router prompt and the CAPABILITY_MAP.
    """

    # Maps routing-plan keys to the tool names they trigger.
    # Extend this when new capabilities are added.
    CAPABILITY_MAP: Dict[str, str] = {
        "graph_rag": "graph_rag",          # handled by BrainAgent.graph_rag
        "get_meetings": "get_meetings",
        "create_event": "create_event",    # calendar event creation
        "create_task": "create_task",      # task creation on an event
        "create_note": "create_note",      # create a note
        "edit_note": "edit_note",          # edit an existing note
    }

    def __init__(self, registry: ToolRegistry) -> None:
        self.registry = registry

    # ------------------------------------------------------------------
    # Stage 1: Routing
    # ------------------------------------------------------------------

    async def route(self, goal: str) -> Dict[str, bool]:
        """
        Ask the LLM router which capabilities are needed for *goal*.

        Returns a dict like ``{"graph_rag": True, "get_meetings": False}``.
        Falls back to graph_rag-only when the router is unavailable.
        """
        router = self.registry.get("llm_router")
        if not router:
            logger.warning("llm_router not registered; defaulting to graph_rag=True")
            return {cap: (cap == "graph_rag") for cap in self.CAPABILITY_MAP}

        result = await router.run(question=goal)
        raw = result.get("answer", "{}")
        try:
            text = raw.strip()
            # Strip markdown code fences the LLM may wrap around JSON
            fence_match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
            if fence_match:
                text = fence_match.group(1).strip()
            plan = json.loads(text)
            if not isinstance(plan, dict):
                raise ValueError("routing plan is not a JSON object")
            # Ensure all known capabilities have a boolean value
            for cap in self.CAPABILITY_MAP:
                plan.setdefault(cap, False)
            return plan
        except Exception as exc:
            logger.warning(
                "Router returned invalid plan (%s); raw=%r -- defaulting to graph_rag",
                exc,
                raw[:200],
            )
            return {cap: (cap == "graph_rag") for cap in self.CAPABILITY_MAP}

    # ------------------------------------------------------------------
    # Stage 2: Planning
    # ------------------------------------------------------------------

    def plan(
        self,
        routing: Dict[str, bool],
        extra_kwargs: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> List[Step]:
        """
        Convert a routing decision into an ordered list of :class:`Step` objects.

        Steps whose capabilities are independent are assigned the same
        ``parallel_group`` so they can be executed concurrently.

        *extra_kwargs* lets the caller inject tool-specific arguments, e.g.
        ``{"graph_rag": {"user_email": "...", "max_iters": 4}}``.
        """
        extra_kwargs = extra_kwargs or {}
        steps: List[Step] = []
        group = 0

        active_caps = [cap for cap, enabled in routing.items() if enabled]

        if not active_caps:
            # Nothing selected -- the caller should handle this
            return []

        # All active capabilities can run in parallel (they are independent)
        for cap in active_caps:
            tool_name = self.CAPABILITY_MAP.get(cap, cap)
            kwargs = extra_kwargs.get(cap, {})
            steps.append(Step(tool_name=tool_name, kwargs=kwargs, parallel_group=group))

        return steps

    # ------------------------------------------------------------------
    # Stage 3: Execution
    # ------------------------------------------------------------------

    async def execute_plan(self, steps: List[Step]) -> List[StepResult]:
        """
        Execute all steps, running same-group steps concurrently.

        Returns a :class:`StepResult` for every step, preserving order.
        """
        if not steps:
            return []

        # Group by parallel_group
        groups: Dict[int, List[Step]] = {}
        for s in steps:
            groups.setdefault(s.parallel_group, []).append(s)

        all_results: List[StepResult] = []
        for gid in sorted(groups):
            group_steps = groups[gid]
            if len(group_steps) == 1:
                # Single step -- run directly
                all_results.append(await self._run_step(group_steps[0]))
            else:
                # Multiple steps -- run concurrently
                coros = [self._run_step(s) for s in group_steps]
                group_results = await asyncio.gather(*coros, return_exceptions=False)
                all_results.extend(group_results)

        return all_results

    async def _run_step(self, step: Step) -> StepResult:
        """Execute a single step and wrap the result."""
        tool = self.registry.get(step.tool_name)
        if tool is None:
            logger.error("Tool '%s' not found in registry", step.tool_name)
            return StepResult(
                tool_name=step.tool_name,
                output={},
                success=False,
                error=f"Tool '{step.tool_name}' is not registered",
            )
        try:
            output = await tool.run(**step.kwargs)
            return StepResult(tool_name=step.tool_name, output=output, success=True)
        except Exception as exc:
            logger.exception("Tool '%s' raised an exception", step.tool_name)
            return StepResult(
                tool_name=step.tool_name,
                output={},
                success=False,
                error=str(exc),
            )

    # ------------------------------------------------------------------
    # Convenience: single-tool execution (backward compat)
    # ------------------------------------------------------------------

    async def execute(self, tool_name: str, **kwargs: Any) -> Dict[str, Any]:
        """Execute a single registered tool by name."""
        result = await self._run_step(Step(tool_name=tool_name, kwargs=kwargs))
        if not result.success:
            return {"error": result.error, "tool": tool_name}
        return result.output

    # ------------------------------------------------------------------
    # Full pipeline (route + plan + execute)
    # ------------------------------------------------------------------

    async def run_pipeline(
        self,
        goal: str,
        extra_kwargs: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> PipelineResult:
        """
        Run the complete orchestration pipeline:
        route -> plan -> execute.

        Returns a :class:`PipelineResult` with routing decision, steps,
        and per-step results.
        """
        routing = await self.route(goal)
        steps = self.plan(routing, extra_kwargs=extra_kwargs)
        results = await self.execute_plan(steps)
        return PipelineResult(routing_plan=routing, steps=steps, results=results)
