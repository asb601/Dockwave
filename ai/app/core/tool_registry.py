"""
ToolRegistry – pluggable tool registry for the Docwave agent system.

Tools are registered once at startup and looked up by name during agent
execution. This decouples tool discovery from agent logic, making it easy
to add, remove, or swap tools without touching BrainAgent.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Protocol, runtime_checkable


@runtime_checkable
class Tool(Protocol):
    """Protocol every tool must satisfy."""

    name: str
    description: str

    async def run(self, **kwargs: Any) -> Dict[str, Any]:  # noqa: D102
        ...


class ToolRegistry:
    """
    Central registry for all agent tools.

    Usage::

        registry = ToolRegistry()
        registry.register(VectorSearchTool(...))
        registry.register(LLMTool())

        tool = registry.get("vector_search")   # Optional[Tool]
        tool = registry.require("llm_summarize")  # raises KeyError if missing
    """

    def __init__(self) -> None:
        self._tools: Dict[str, Tool] = {}

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, tool: Tool) -> "ToolRegistry":
        """Register a tool and return *self* for fluent chaining."""
        self._tools[tool.name] = tool
        return self

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------

    def get(self, name: str) -> Optional[Tool]:
        """Return the tool or *None* if not registered."""
        return self._tools.get(name)

    def require(self, name: str) -> Tool:
        """Return the tool or raise *KeyError* if not registered."""
        tool = self._tools.get(name)
        if tool is None:
            raise KeyError(
                f"Tool '{name}' is not registered. "
                f"Available tools: {self.names()}"
            )
        return tool

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    def names(self) -> List[str]:
        """Return a sorted list of registered tool names."""
        return sorted(self._tools.keys())

    def all(self) -> Dict[str, Tool]:
        """Return a shallow copy of the registry mapping."""
        return dict(self._tools)

    def __contains__(self, name: str) -> bool:  # noqa: D105
        return name in self._tools

    def __len__(self) -> int:  # noqa: D105
        return len(self._tools)
