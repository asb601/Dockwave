"""
KnowledgeService – thin abstraction over GraphClient for knowledge-base
queries.  Decouples route handlers from the raw graph driver so the
implementation can be swapped or mocked in tests without touching routes.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from app.services.graph import GraphClient

logger = logging.getLogger("intellidoc.knowledge_service")


class KnowledgeService:
    """Provides read-only access to a user's knowledge graph."""

    def get_user_knowledge(self, user_id: str) -> Dict[str, Any]:
        """
        Return the knowledge JSON for *user_id*.

        :raises RuntimeError: if the graph query fails.
        """
        graph = GraphClient()
        try:
            return graph.get_user_knowledge_json(user_id)
        except Exception as exc:
            logger.exception("Failed to fetch knowledge for user '%s'", user_id)
            raise RuntimeError(f"Knowledge fetch failed: {exc}") from exc
        finally:
            graph.close()
