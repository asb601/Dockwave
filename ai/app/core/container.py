"""
Dependency-injection container for the IntelliDoc AI service.

The container wires up all tool dependencies from environment variables
and exposes a singleton ToolRegistry.  Call :func:`get_registry` from
route handlers or the agent controller – never instantiate tools inline.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from .tool_registry import ToolRegistry

logger = logging.getLogger("intellidoc.container")

_registry: Optional[ToolRegistry] = None


def _build_registry() -> ToolRegistry:
    """Construct and wire all tools from the current environment."""
    # Deferred import so that tool modules are only loaded after dotenv is
    # applied (dotenv is loaded in main.py before this is called).
    from app.agents.tools import (  # noqa: PLC0415
        GetMeetingsTool,
        GraphSearchTool,
        LLMRouterTool,
        LLMTool,
        VectorSearchTool,
    )

    neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.getenv("NEO4J_USERNAME", "neo4j")
    neo4j_password = os.getenv("NEO4J_PASSWORD", "please-change-me")
    next_api_base = os.getenv("NEXT_API_BASE", "http://localhost:3000")

    registry = (
        ToolRegistry()
        .register(VectorSearchTool(uri=neo4j_uri, user=neo4j_user, password=neo4j_password))
        .register(GraphSearchTool(uri=neo4j_uri, user=neo4j_user, password=neo4j_password))
        .register(LLMTool())
        .register(GetMeetingsTool(api_base_url=next_api_base))
        .register(LLMRouterTool())
    )

    logger.info("ToolRegistry built with tools: %s", registry.names())
    return registry


def get_registry() -> ToolRegistry:
    """Return the singleton ToolRegistry, building it on first access."""
    global _registry  # noqa: PLW0603
    if _registry is None:
        _registry = _build_registry()
    return _registry


def reset_registry() -> None:
    """Reset the singleton registry (useful in tests)."""
    global _registry  # noqa: PLW0603
    _registry = None
