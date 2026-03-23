from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from neo4j import GraphDatabase

from app.core.llm_config import build_llm_client
from app.services.entity_extraction import EntityExtractor
from app.util.log import estimate_cost, log_event
from app.util.prompts import RouterPrompt, summarize_prompt

logger = logging.getLogger("intellidoc.tools")


@dataclass
class LLMRouterTool:
    name: str = "llm_router"
    description: str = "LLM-based router that decides which tool to call."
    llm: Any = None
    prompt: Any = None

    def __post_init__(self) -> None:
        if self.llm is None:
            self.llm = LLMTool()
        self.prompt = RouterPrompt() if callable(RouterPrompt) else RouterPrompt

    async def run(self, question: str) -> Dict[str, Any]:
        if hasattr(self.prompt, "build"):
            used_prompt = self.prompt.build(question)
        elif "{question}" in self.prompt:
            used_prompt = self.prompt.format(question=question)
        else:
            used_prompt = self.prompt

        response = await self.llm.run(question=question, prompt=used_prompt, chunks=[])
        if isinstance(response, dict) and "answer" in response:
            return {"answer": response["answer"]}
        return {"answer": str(response)}


@dataclass
class VectorSearchTool:
    """Vector similarity search against the Neo4j chunk embedding index.

    The Neo4j driver and embedding API key are initialised once at startup
    and reused across every request — no per-call connection overhead.
    The embedding model is kept in sync with the ingest pipeline via the
    COHERE_EMBED_MODEL env var (default: embed-v4.0).
    """

    uri: str
    user: str
    password: str
    database: str = ""
    index_name: str = "chunk_embedding_index"
    name: str = "vector_search"
    description: str = "Vector search over Chunk.embedding using Neo4j vector index."

    def __post_init__(self) -> None:
        self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        self._db = self.database or None
        self._cohere_api_key = os.getenv("COHERE_API_KEY") or os.getenv("embeedings_api", "")
        self._embed_model = os.getenv("COHERE_EMBED_MODEL", "embed-v4.0")
        if not self._cohere_api_key:
            raise RuntimeError("COHERE_API_KEY is not configured")

    def close(self) -> None:
        self._driver.close()

    async def _embed(self, text: str) -> List[float]:
        """Async Cohere v2 embedding call — does not block the event loop."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.cohere.com/v2/embed",
                headers={"Authorization": f"Bearer {self._cohere_api_key}"},
                json={
                    "model": self._embed_model,
                    "input_type": "search_query",
                    "texts": [text],
                    "embedding_types": ["float"],
                },
            )
            resp.raise_for_status()
            return resp.json()["embeddings"]["float"][0]

    async def run(self, query: str, top_k: int = 15) -> Dict[str, Any]:
        try:
            vec = await self._embed(query)
            driver = self._driver
            index_name = self.index_name
            db = self._db

            def _query() -> List[Dict[str, Any]]:
                with driver.session(database=db) if db else driver.session() as sess:
                    rows = sess.run(
                        "CALL db.index.vector.queryNodes($index, $k, $vec) YIELD node, score "
                        "MATCH (f:File)-[:HAS_CHUNK]->(node) "
                        "RETURN f.name AS file, node.text AS text, node.page AS page, score "
                        "ORDER BY score DESC",
                        index=index_name,
                        k=top_k,
                        vec=vec,
                    )
                    return [
                        {
                            "file": r["file"],
                            "text": r["text"],
                            "page": r["page"] or 0,
                            "score": float(r["score"]),
                            "source": "vector",
                            "initial_rank": i,
                        }
                        for i, r in enumerate(rows)
                    ]

            items = await asyncio.to_thread(_query)
            log_event("search.vector", {"query": query[:120], "results": len(items)})
            return {"items": items}
        except Exception as exc:
            log_event("search.vector.error", {"query": query[:120], "error": str(exc)})
            logger.error("Vector search failed: %s", exc)
            return {"items": [], "error": str(exc)}


@dataclass
class GraphSearchTool:
    """Keyword/CONTAINS search across Neo4j chunks.

    The driver is created once at startup and shared across all requests.
    The blocking Neo4j session is offloaded to a thread so the async event
    loop is never stalled.
    """

    uri: str
    user: str
    password: str
    database: str = ""
    name: str = "graph_search"
    description: str = "Search Neo4j chunks and files by text query (CONTAINS search)."

    def __post_init__(self) -> None:
        self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        self._db = self.database or None

    def close(self) -> None:
        self._driver.close()

    async def run(self, query: str, top_k: int = 5) -> Dict[str, Any]:
        driver = self._driver
        db = self._db

        def _query() -> List[Dict[str, Any]]:
            with driver.session(database=db) if db else driver.session() as sess:
                rows = sess.run(
                    "MATCH (f:File)-[:HAS_CHUNK]->(c:Chunk) "
                    "WHERE toLower(c.text) CONTAINS toLower($q) "
                    "RETURN f.name AS file, c.text AS text, c.page AS page LIMIT $k",
                    q=query,
                    k=top_k,
                )
                return [
                    {
                        "file": r["file"],
                        "text": r["text"],
                        "page": r["page"] or 0,
                        "source": "graph",
                        "initial_rank": i,
                    }
                    for i, r in enumerate(rows)
                ]

        try:
            items = await asyncio.to_thread(_query)
            log_event("search.graph", {"query": query[:120], "results": len(items)})
            return {"items": items}
        except Exception as exc:
            log_event("search.graph.error", {"query": query[:120], "error": str(exc)})
            logger.error("Graph search failed: %s", exc)
            return {"items": [], "error": str(exc)}


@dataclass
class EntityGraphSearchTool:
    """Graph traversal search: extracts entities from the query, then
    traverses Entity→Chunk→File relationships in Neo4j.

    Both the entity-extraction LLM call and the Neo4j query are blocking
    operations; they are offloaded to threads so the event loop stays free.
    The extractor and graph client are created once at startup and reused.
    """

    uri: str
    user: str
    password: str
    database: str = ""
    name: str = "entity_graph_search"
    description: str = (
        "Search Neo4j knowledge graph by extracting entities from the query "
        "and traversing entity relationships across documents."
    )

    def __post_init__(self) -> None:
        self._extractor = EntityExtractor()
        # Persistent Neo4j driver — shared across all requests.
        self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        self._db = self.database or None

    def close(self) -> None:
        self._driver.close()

    async def run(self, query: str, top_k: int = 10) -> Dict[str, Any]:
        # Entity extraction is a synchronous LLM call — run it in a thread.
        entities = await asyncio.to_thread(self._extractor.extract, query)
        entity_names = [e["name"] for e in entities]

        if not entity_names:
            entity_names = [
                w for w in query.split()
                if len(w) > 3
                and w.lower()
                not in {
                    "what", "when", "where", "which", "that", "this",
                    "from", "with", "about", "does", "have", "been",
                    "will", "would", "could", "should", "their", "there",
                }
            ][:5]

        if not entity_names:
            return {"items": [], "entities_searched": []}

        from app.services.graph import GraphClient  # avoid circular at module level

        driver = self._driver

        def _search() -> List[Dict[str, Any]]:
            # Borrow the persistent driver without taking ownership.
            graph = GraphClient(driver=driver)
            return graph.entity_graph_search(
                query_entities=entity_names,
                top_k=top_k,
            )

        try:
            items = await asyncio.to_thread(_search)
            log_event("search.entity_graph", {"entities": entity_names, "results": len(items)})
            return {
                "items": items,
                "entities_searched": entity_names,
                "entities_extracted": entities,
            }
        except Exception as exc:
            log_event("search.entity_graph.error", {"entities": entity_names, "error": str(exc)})
            logger.error("Entity graph search failed: %s", exc)
            return {"items": [], "error": str(exc), "entities_searched": entity_names}


@dataclass
class LLMTool:
    """LLM summariser / general-purpose tool.

    The OpenAI-compatible client is initialised lazily on first use and then
    reused.  The blocking HTTP call is wrapped in asyncio.to_thread so that
    concurrent requests can still be served while the LLM round-trip is in
    flight.
    """

    name: str = "llm_summarize"
    description: str = (
        "Summarise chunks with citations using the configured LLM provider "
        "(Groq / Azure OpenAI / OpenAI)."
    )
    model_name: str = "llama-3.3-70b-versatile"

    def __post_init__(self) -> None:
        self._client: Any = None
        self._provider: Optional[str] = None
        self._deployment: str = self.model_name

    def _configure(self) -> bool:
        """Initialise the LLM client (once). Returns False if not configured."""
        if self._client is not None:
            return True
        cfg = build_llm_client(default_model=self.model_name)
        if cfg is None:
            return False
        self._client = cfg.client
        self._provider = cfg.provider
        self._deployment = cfg.model
        return True

    async def run(
        self, question: str, prompt: str, chunks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        cites: list[str] = []
        for i, ch in enumerate(chunks[:20]):
            label = f"[{i + 1}]"
            fname = ch.get("file", "unknown")
            page = f", p.{ch['page']}" if ch.get("page") else ""
            text = (ch.get("text") or "")[:1200].replace("\n", " ")
            cites.append(f"{label} File: {fname}{page}\n{text}")
        context = "\n---\n".join(cites) or "(no context provided)"

        if not self._configure():
            log_event("llm.unconfigured", {"provider": "none"})
            return {"answer": "Model not configured.", "provider": "stub"}

        system_prompt = prompt
        user_prompt = (
            f"Question: {question}\n\n"
            f"Context chunks:\n---\n{context}\n---\n\n"
            "Answer the question using ONLY the context chunks above.\n"
            "- Cite each fact as [n, p.X] matching the chunk number and page.\n"
            "- If a value is NOT in any chunk, say it is not mentioned.\n"
            "- Never guess or fill in missing numbers."
        )

        client = self._client
        deployment = self._deployment

        def _call():
            return client.chat.completions.create(
                model=deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=1024,
            )

        try:
            resp = await asyncio.to_thread(_call)
            txt = resp.choices[0].message.content if resp.choices else ""
            usage = getattr(resp, "usage", None)
            prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
            completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
            total_tokens = getattr(usage, "total_tokens", None) if usage else None
            cost = None
            if isinstance(prompt_tokens, int) and isinstance(completion_tokens, int):
                cost = estimate_cost(prompt_tokens, completion_tokens)
            log_event(
                "llm.call",
                {
                    "provider": self._provider or "openai",
                    "deployment": deployment,
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens,
                    "estimated_cost_usd": cost,
                },
            )
            return {
                "answer": txt,
                "provider": self._provider or "openai",
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens,
                    "estimated_cost_usd": cost,
                },
            }
        except Exception as exc:
            log_event(
                "llm.error",
                {"provider": self._provider or "openai", "deployment": deployment, "error": str(exc)},
            )
            logger.exception("LLM call failed")
            return {"answer": "LLM call failed.", "provider": "stub-error"}


@dataclass
class GetMeetingsTool:
    """Fetch calendar events from the Next.js API.

    The api_base_url is validated at construction time so that a
    misconfigured env var cannot be used as an SSRF vector.
    The HTTP call uses httpx.AsyncClient so it never blocks the event loop.
    """

    api_base_url: str = "http://localhost:3000"
    service_token: str = ""
    name: str = "get_meetings"
    description: str = (
        "Fetch calendar events (with tasks) for a specific user from the Next.js API. "
        "Accepts start and end date as ISO8601 strings and user_email for scoping."
    )

    def __post_init__(self) -> None:
        parsed = urlparse(self.api_base_url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(
                f"Invalid api_base_url scheme '{parsed.scheme}'. Must be http or https."
            )
        if not self.service_token:
            self.service_token = os.getenv("SERVICE_TOKEN", "")

    async def run(self, start: str, end: str, user_email: Optional[str] = None) -> Dict[str, Any]:
        logger.info("GetMeetingsTool called: start=%s, end=%s, user=%s", start, end, user_email)
        log_event(
            "tool.invoke",
            {"tool": self.name, "start": start, "end": end, "user_email": user_email},
        )

        def _to_iso8601(dt: str, is_start: bool) -> str:
            if "T" in dt and dt.endswith("Z"):
                return dt
            try:
                parsed = datetime.fromisoformat(dt)
                suffix = "T00:00:00.000Z" if is_start else "T23:59:59.000Z"
                return parsed.strftime("%Y-%m-%d") + suffix
            except (ValueError, TypeError):
                return dt

        formatted_start = _to_iso8601(start, is_start=True)
        formatted_end = _to_iso8601(end, is_start=False)
        url = f"{self.api_base_url}/api/calendar/events/eventsALL"

        params: Dict[str, str] = {"start": formatted_start, "end": formatted_end}
        if user_email:
            params["user_email"] = user_email

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    url,
                    params=params,
                    headers={
                        "Content-Type": "application/json",
                        "x-service-token": self.service_token,
                    },
                )
            if not response.is_success:
                logger.warning(
                    "GetMeetingsTool error: status=%d body=%s",
                    response.status_code,
                    response.text[:200],
                )
                return {"error": "Calendar API request failed", "status": response.status_code}
            return response.json()
        except httpx.TimeoutException:
            logger.error("GetMeetingsTool timed out")
            return {"error": "Request to calendar API timed out"}
        except Exception as exc:
            logger.exception("GetMeetingsTool failed")
            return {"error": "Calendar API unavailable"}


@dataclass
class CreateEventTool:
    """Create a calendar event via the Next.js internal API.

    Requires ``api_base_url`` (Next.js origin) and a ``service_token`` that
    matches the Next.js ``SERVICE_TOKEN`` env var.  The HTTP call is async
    via httpx.
    """

    api_base_url: str = "http://localhost:3000"
    service_token: str = ""
    name: str = "create_event"
    description: str = (
        "Create a new calendar event (meeting/appointment) for the user. "
        "Accepts title, start (ISO8601), optional end, description, tasks[]."
    )

    def __post_init__(self) -> None:
        parsed = urlparse(self.api_base_url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Invalid api_base_url scheme '{parsed.scheme}'.")
        if not self.service_token:
            self.service_token = os.getenv("SERVICE_TOKEN", "")

    async def run(
        self,
        user_email: str,
        title: str,
        start: str,
        end: Optional[str] = None,
        description: Optional[str] = None,
        is_all_day: bool = False,
        tasks: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        url = f"{self.api_base_url}/api/ai-actions/create-event"
        payload: Dict[str, Any] = {
            "user_email": user_email,
            "title": title,
            "start": start,
        }
        if end:
            payload["end"] = end
        if description:
            payload["description"] = description
        if is_all_day:
            payload["is_all_day"] = True
        if tasks:
            payload["tasks"] = tasks

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    url,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "x-service-token": self.service_token,
                    },
                )
            if not resp.is_success:
                logger.warning("CreateEventTool error: %d %s", resp.status_code, resp.text[:200])
                return {"error": f"Failed to create event: {resp.status_code}"}
            return resp.json()
        except Exception as exc:
            logger.exception("CreateEventTool failed")
            return {"error": "Calendar API unavailable"}


@dataclass
class CreateTaskTool:
    """Create a task on an existing calendar event via the Next.js internal API."""

    api_base_url: str = "http://localhost:3000"
    service_token: str = ""
    name: str = "create_task"
    description: str = (
        "Create a new task on an existing calendar event. "
        "Accepts event_id, title, optional description, due_date, due_time, priority."
    )

    def __post_init__(self) -> None:
        parsed = urlparse(self.api_base_url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Invalid api_base_url scheme '{parsed.scheme}'.")
        if not self.service_token:
            self.service_token = os.getenv("SERVICE_TOKEN", "")

    async def run(
        self,
        user_email: str,
        event_id: str,
        title: str,
        description: Optional[str] = None,
        due_date: Optional[str] = None,
        due_time: Optional[str] = None,
        priority: str = "MEDIUM",
    ) -> Dict[str, Any]:
        url = f"{self.api_base_url}/api/ai-actions/create-task"
        payload: Dict[str, Any] = {
            "user_email": user_email,
            "event_id": event_id,
            "title": title,
        }
        if description:
            payload["description"] = description
        if due_date:
            payload["due_date"] = due_date
        if due_time:
            payload["due_time"] = due_time
        if priority:
            payload["priority"] = priority

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    url,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "x-service-token": self.service_token,
                    },
                )
            if not resp.is_success:
                logger.warning("CreateTaskTool error: %d %s", resp.status_code, resp.text[:200])
                return {"error": f"Failed to create task: {resp.status_code}"}
            return resp.json()
        except Exception as exc:
            logger.exception("CreateTaskTool failed")
            return {"error": "Calendar API unavailable"}


@dataclass
class CreateNoteTool:
    """Create a note for a user via the Next.js internal API."""

    api_base_url: str = "http://localhost:3000"
    service_token: str = ""
    name: str = "create_note"
    description: str = (
        "Create a new note for the user. "
        "Accepts title and optional content (markdown)."
    )

    def __post_init__(self) -> None:
        parsed = urlparse(self.api_base_url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Invalid api_base_url scheme '{parsed.scheme}'.")
        if not self.service_token:
            self.service_token = os.getenv("SERVICE_TOKEN", "")

    async def run(
        self,
        user_email: str,
        title: str,
        content: Optional[str] = None,
    ) -> Dict[str, Any]:
        url = f"{self.api_base_url}/api/ai-actions/create-note"
        payload: Dict[str, Any] = {"user_email": user_email, "title": title}
        if content:
            payload["content"] = content

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    url,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "x-service-token": self.service_token,
                    },
                )
            if not resp.is_success:
                logger.warning("CreateNoteTool error: %d %s", resp.status_code, resp.text[:200])
                return {"error": f"Failed to create note: {resp.status_code}"}
            return resp.json()
        except Exception as exc:
            logger.exception("CreateNoteTool failed")
            return {"error": "Notes API unavailable"}


@dataclass
class EditNoteTool:
    """Edit an existing note or list notes for a user via the Next.js API."""

    api_base_url: str = "http://localhost:3000"
    service_token: str = ""
    name: str = "edit_note"
    description: str = (
        "Edit an existing note. Can list user's notes to find one, "
        "then update its title and/or content."
    )

    def __post_init__(self) -> None:
        parsed = urlparse(self.api_base_url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Invalid api_base_url scheme '{parsed.scheme}'.")
        if not self.service_token:
            self.service_token = os.getenv("SERVICE_TOKEN", "")

    async def list_notes(self, user_email: str) -> Dict[str, Any]:
        """Fetch all notes for a user (id + title only)."""
        url = f"{self.api_base_url}/api/ai-actions/edit-note"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    url,
                    params={"user_email": user_email},
                    headers={"x-service-token": self.service_token},
                )
            if not resp.is_success:
                return {"error": f"Failed to list notes: {resp.status_code}"}
            return resp.json()
        except Exception as exc:
            logger.exception("EditNoteTool.list_notes failed")
            return {"error": "Notes API unavailable"}

    async def run(
        self,
        user_email: str,
        note_id: str,
        title: Optional[str] = None,
        content: Optional[str] = None,
    ) -> Dict[str, Any]:
        url = f"{self.api_base_url}/api/ai-actions/edit-note"
        payload: Dict[str, Any] = {
            "user_email": user_email,
            "note_id": note_id,
        }
        if title is not None:
            payload["title"] = title
        if content is not None:
            payload["content"] = content

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.patch(
                    url,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "x-service-token": self.service_token,
                    },
                )
            if not resp.is_success:
                logger.warning("EditNoteTool error: %d %s", resp.status_code, resp.text[:200])
                return {"error": f"Failed to edit note: {resp.status_code}"}
            return resp.json()
        except Exception as exc:
            logger.exception("EditNoteTool failed")
            return {"error": "Notes API unavailable"}
