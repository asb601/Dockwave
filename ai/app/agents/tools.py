from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from neo4j import GraphDatabase
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.llm_config import build_llm_chain, LLMClientConfig
from app.services.entity_extraction import EntityExtractor
from app.util.log import estimate_cost, log_event, log_llm_cost
from app.util.prompts import summarize_prompt

logger = logging.getLogger("docwave.tools")


@dataclass
class LLMRouterTool:
    name: str = "llm_router"
    description: str = "LLM-based router using tool calling for structured routing decisions."

    def __post_init__(self) -> None:
        self._chain: List[LLMClientConfig] = []
        self._configured = False

    def _configure(self) -> bool:
        if self._configured:
            return bool(self._chain)
        self._chain = build_llm_chain(default_model="gpt-4o-mini")
        self._configured = True
        return bool(self._chain)

    _ROUTE_TOOL = {
        "type": "function",
        "function": {
            "name": "set_route",
            "description": "Set which capabilities to activate for this user request.",
            "parameters": {
                "type": "object",
                "properties": {
                    "graph_rag": {"type": "boolean", "description": "True if the user is asking about document content, research papers, uploaded files, or needs information retrieval."},
                    "get_meetings": {"type": "boolean", "description": "True if the user wants to view/check existing meetings, calendar, schedule, or events."},
                    "create_event": {"type": "boolean", "description": "True if the user wants to CREATE or SCHEDULE a new meeting/event/appointment."},
                    "create_task": {"type": "boolean", "description": "True if the user wants to CREATE a new task/todo/reminder."},
                    "create_note": {"type": "boolean", "description": "True if the user wants to CREATE or WRITE a new note/memo/summary. If they say 'summarize documents into notes', set BOTH graph_rag and create_note."},
                    "edit_note": {"type": "boolean", "description": "True if the user wants to EDIT/UPDATE an existing note."},
                },
                "required": ["graph_rag", "get_meetings", "create_event", "create_task", "create_note", "edit_note"],
            },
        },
    }

    async def run(self, question: str, history: list | None = None) -> Dict[str, Any]:
        if not self._configure():
            return {"answer": "{}"}

        import asyncio

        cfg = self._chain[0]

        # Build messages with conversation history for follow-up resolution
        messages = [
            {"role": "system", "content": (
                "You are a routing agent. Decide which capabilities to activate based on the user's request. "
                "Multiple can be true if relevant. Use the conversation history to understand "
                "references like 'the notes', 'that document', 'it', etc."
            )},
        ]
        if history:
            for msg in history[-4:]:
                messages.append({"role": msg.get("role", "user"), "content": (msg.get("content") or "")[:300]})
        messages.append({"role": "user", "content": question})

        def _call():
            return cfg.client.chat.completions.create(
                model=cfg.model,
                messages=messages,
                tools=[self._ROUTE_TOOL],
                tool_choice={"type": "function", "function": {"name": "set_route"}},
                temperature=0.0,
                max_tokens=100,
            )

        try:
            resp = await asyncio.to_thread(_call)
            usage = getattr(resp, "usage", None)
            if usage:
                log_llm_cost(
                    caller="router",
                    provider=cfg.provider,
                    model=cfg.model,
                    prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                    completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
                )
            if resp.choices and resp.choices[0].message.tool_calls:
                args = resp.choices[0].message.tool_calls[0].function.arguments
                return {"answer": args}
            # Fallback: return content if no tool call
            content = resp.choices[0].message.content if resp.choices else "{}"
            return {"answer": content or "{}"}
        except Exception as exc:
            logger.warning("LLM router tool call failed: %s", exc)
            return {"answer": "{}"}


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
        self._http_client = httpx.AsyncClient(timeout=30.0)
        if not self._cohere_api_key:
            raise RuntimeError("COHERE_API_KEY is not configured")

    def close(self) -> None:
        self._driver.close()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
        reraise=True,
    )
    async def _embed(self, text: str) -> List[float]:
        """Async Cohere v2 embedding call with retry — reuses a single HTTP client."""
        resp = await self._http_client.post(
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

    async def run(self, query: str, top_k: int = 15, user_email: str = "") -> Dict[str, Any]:
        try:
            vec = await self._embed(query)
            driver = self._driver
            index_name = self.index_name
            db = self._db

            def _query() -> List[Dict[str, Any]]:
                with driver.session(database=db) if db else driver.session() as sess:
                    # User-scoped vector search: filter to the user's chunks only
                    if user_email:
                        rows = sess.run(
                            "CALL db.index.vector.queryNodes($index, $k, $vec) YIELD node, score "
                            "WHERE node.userEmail = $userEmail "
                            "MATCH (f:File)-[:HAS_CHUNK]->(node) "
                            "RETURN f.name AS file, node.text AS text, node.parentText AS parent_text, node.page AS page, score "
                            "ORDER BY score DESC",
                            index=index_name,
                            k=top_k * 2,  # over-fetch before filtering
                            vec=vec,
                            userEmail=user_email,
                        )
                    else:
                        rows = sess.run(
                            "CALL db.index.vector.queryNodes($index, $k, $vec) YIELD node, score "
                            "MATCH (f:File)-[:HAS_CHUNK]->(node) "
                            "RETURN f.name AS file, node.text AS text, node.parentText AS parent_text, node.page AS page, score "
                            "ORDER BY score DESC",
                            index=index_name,
                            k=top_k,
                            vec=vec,
                        )
                    return [
                        {
                            "file": r["file"],
                            "text": r["parent_text"] or r["text"],
                            "page": r["page"] or 0,
                            "score": float(r["score"]),
                            "source": "vector",
                            "initial_rank": i,
                        }
                        for i, r in enumerate(rows)
                    ][:top_k]

            items = await asyncio.to_thread(_query)
            log_event("search.vector", {"query": query[:120], "results": len(items)})
            return {"items": items}
        except Exception as exc:
            log_event("search.vector.error", {"query": query[:120], "error": str(exc)})
            logger.error("Vector search failed: %s", exc)
            return {"items": [], "error": str(exc)}


@dataclass
class GraphSearchTool:
    """Full-text search across Neo4j chunks using a native full-text index.

    On first use the tool ensures ``CREATE FULLTEXT INDEX chunk_fulltext
    IF NOT EXISTS FOR (c:Chunk) ON EACH [c.text]`` exists.  Subsequent
    queries use ``db.index.fulltext.queryNodes`` which supports stemming,
    fuzzy matching, and relevance scoring — far superior to the old
    ``CONTAINS`` approach.
    """

    uri: str
    user: str
    password: str
    database: str = ""
    name: str = "graph_search"
    description: str = "Full-text search over Neo4j Chunk nodes via native fulltext index."

    def __post_init__(self) -> None:
        self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        self._db = self.database or None
        self._index_ensured = False

    def close(self) -> None:
        self._driver.close()

    def _ensure_fulltext_index(self) -> None:
        """Idempotently create the fulltext index (cheap if it already exists)."""
        if self._index_ensured:
            return
        try:
            with (self._driver.session(database=self._db) if self._db
                  else self._driver.session()) as sess:
                sess.run(
                    "CREATE FULLTEXT INDEX chunk_fulltext IF NOT EXISTS "
                    "FOR (c:Chunk) ON EACH [c.text]"
                )
            self._index_ensured = True
        except Exception as exc:
            # Index may already exist or DB version may not support it;
            # fall through and let the query attempt surface the real error.
            logger.warning("Fulltext index creation skipped: %s", exc)
            self._index_ensured = True  # don't retry every call

    async def run(self, query: str, top_k: int = 15, user_email: str = "") -> Dict[str, Any]:
        driver = self._driver
        db = self._db

        # Ensure index exists (no-op after first call)
        await asyncio.to_thread(self._ensure_fulltext_index)

        # Build a Lucene query: escape special chars, add fuzzy suffix
        lucene_query = self._build_lucene_query(query)

        def _query() -> List[Dict[str, Any]]:
            with driver.session(database=db) if db else driver.session() as sess:
                if user_email:
                    rows = sess.run(
                        "CALL db.index.fulltext.queryNodes('chunk_fulltext', $q) "
                        "YIELD node, score "
                        "WHERE node.userEmail = $userEmail "
                        "MATCH (f:File)-[:HAS_CHUNK]->(node) "
                        "RETURN f.name AS file, node.text AS text, "
                        "       node.parentText AS parent_text, node.page AS page, score "
                        "ORDER BY score DESC LIMIT $k",
                        q=lucene_query,
                        k=top_k,
                        userEmail=user_email,
                    )
                else:
                    rows = sess.run(
                        "CALL db.index.fulltext.queryNodes('chunk_fulltext', $q) "
                        "YIELD node, score "
                        "MATCH (f:File)-[:HAS_CHUNK]->(node) "
                        "RETURN f.name AS file, node.text AS text, "
                        "       node.parentText AS parent_text, node.page AS page, score "
                        "ORDER BY score DESC LIMIT $k",
                        q=lucene_query,
                        k=top_k,
                    )
                return [
                    {
                        "file": r["file"],
                        "text": r["parent_text"] or r["text"],
                        "page": r["page"] or 0,
                        "score": float(r["score"]),
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

    @staticmethod
    def _build_lucene_query(text: str) -> str:
        """Turn a natural-language query into a safe Lucene query string.

        Each token is escaped for Lucene special chars and gets a ~1 fuzzy
        suffix so minor spelling differences still match.
        """
        special = set('+-&|!(){}[]^"~*?:\\/')
        tokens = text.split()
        parts: List[str] = []
        for tok in tokens:
            cleaned = "".join(ch if ch not in special else f"\\{ch}" for ch in tok)
            if cleaned:
                parts.append(f"{cleaned}~1")
        return " ".join(parts) if parts else text


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

    async def run(self, query: str, top_k: int = 10, user_email: str = "") -> Dict[str, Any]:
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
                user_email=user_email or None,
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
        "(Azure OpenAI / OpenAI / Groq)."
    )
    model_name: str = "gpt-4o-mini"

    def __post_init__(self) -> None:
        self._chain: List[LLMClientConfig] = []
        self._configured = False
        # Circuit breaker: track when each provider was last rate-limited
        self._provider_cooldown: Dict[str, float] = {}
        self._cooldown_seconds = 30.0  # back off for 30s after a 429

    def _configure(self) -> bool:
        """Initialise the LLM client chain (once). Returns False if none configured."""
        if self._configured:
            return bool(self._chain)
        self._chain = build_llm_chain(default_model=self.model_name)
        self._configured = True
        if not self._chain:
            return False
        return True

    def _is_rate_limited(self, provider: str) -> bool:
        """Check if a provider is in cooldown from a recent rate-limit."""
        cooldown_until = self._provider_cooldown.get(provider, 0)
        return time.monotonic() < cooldown_until

    def _mark_rate_limited(self, provider: str, retry_after: float = 0) -> None:
        """Put a provider in cooldown after a 429."""
        wait = max(retry_after, self._cooldown_seconds)
        self._provider_cooldown[provider] = time.monotonic() + wait

    @staticmethod
    def _extract_retry_after(exc: Exception) -> float:
        """Try to extract Retry-After seconds from an API error.

        Checks the Retry-After header first, then parses Groq-style body
        messages like 'Please try again in 1h24m13.536s'.
        """
        resp = getattr(exc, "response", None)
        if resp is not None:
            val = getattr(resp, "headers", {}).get("retry-after", "")
            try:
                return float(val)
            except (ValueError, TypeError):
                pass
        # Parse durations like "1h24m13.536s" from the error body
        msg = str(exc)
        m = re.search(r"try again in\s+(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?", msg, re.IGNORECASE)
        if m:
            hours = int(m.group(1) or 0)
            minutes = int(m.group(2) or 0)
            secs = float(m.group(3) or 0)
            total = hours * 3600 + minutes * 60 + secs
            if total > 0:
                return total
        return 0

    @staticmethod
    def _is_429(exc: Exception) -> bool:
        """Check if an exception is a rate-limit (429) error."""
        status = getattr(exc, "status_code", None) or getattr(
            getattr(exc, "response", None), "status_code", None
        )
        if status == 429:
            return True
        return "429" in str(exc) or "rate" in str(exc).lower()

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

        if chunks:
            user_prompt = (
                f"Question: {question}\n\n"
                f"Context chunks:\n---\n{context}\n---\n\n"
                "Answer the question using ONLY the context chunks above.\n"
                "- Cite each fact as [n, p.X] matching the chunk number and page.\n"
                "- If a value is NOT in any chunk, say it is not mentioned.\n"
                "- Never guess or fill in missing numbers."
            )
        else:
            user_prompt = question

        last_exc: Optional[Exception] = None
        # If only 1 provider available, be more patient with retries
        available = [c for c in self._chain if not self._is_rate_limited(c.provider)]
        if not available:
            # All in cooldown — clear cooldowns and try anyway
            self._provider_cooldown.clear()
            available = self._chain

        for cfg in available:
            client = cfg.client
            deployment = cfg.model
            provider = cfg.provider

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

            # More patient retries when there's only 1 provider (e.g. Groq-only)
            max_retries = 5 if len(available) == 1 else 3
            for attempt in range(1, max_retries + 1):
                try:
                    resp = await asyncio.to_thread(_call)
                    txt = resp.choices[0].message.content if resp.choices else ""
                    usage = getattr(resp, "usage", None)
                    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0 if usage else 0
                    completion_tokens = getattr(usage, "completion_tokens", 0) or 0 if usage else 0
                    cost = log_llm_cost(
                        caller="summarize",
                        provider=provider,
                        model=deployment,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                    )
                    return {
                        "answer": txt,
                        "provider": provider,
                        "usage": {
                            "prompt_tokens": prompt_tokens,
                            "completion_tokens": completion_tokens,
                            "total_tokens": prompt_tokens + completion_tokens,
                            "estimated_cost_usd": cost,
                        },
                    }
                except Exception as exc:
                    last_exc = exc
                    if self._is_429(exc) and attempt < max_retries:
                        retry_after = self._extract_retry_after(exc)
                        wait = max(retry_after, 2 ** attempt)  # exponential: 2s, 4s
                        logger.warning(
                            "Rate limited by %s (attempt %d/%d), waiting %.1fs",
                            provider, attempt, max_retries, wait,
                        )
                        await asyncio.sleep(wait)
                        continue
                    if self._is_429(exc):
                        self._mark_rate_limited(provider, self._extract_retry_after(exc))
                    log_event(
                        "llm.fallback",
                        {"failed_provider": provider, "deployment": deployment, "error": str(exc)},
                    )
                    logger.warning("LLM provider %s failed, trying next: %s", provider, exc)
                    break  # move to next provider

        # All providers exhausted
        log_event(
            "llm.error",
            {"provider": "all_exhausted", "error": str(last_exc)},
        )
        logger.exception("All LLM providers failed", exc_info=last_exc)
        return {"answer": "LLM call failed.", "provider": "stub-error"}

    async def stream_run(
        self, question: str, prompt: str, chunks: List[Dict[str, Any]]
    ):
        """Async generator that yields answer tokens one at a time.

        Same logic as ``run()`` but uses ``stream=True`` on the OpenAI-
        compatible client so that tokens are delivered to the caller as
        they arrive from the LLM, enabling real-time SSE streaming.
        """
        cites: list[str] = []
        for i, ch in enumerate(chunks[:20]):
            label = f"[{i + 1}]"
            fname = ch.get("file", "unknown")
            page = f", p.{ch['page']}" if ch.get("page") else ""
            text = (ch.get("text") or "")[:1200].replace("\n", " ")
            cites.append(f"{label} File: {fname}{page}\n{text}")
        context = "\n---\n".join(cites) or "(no context provided)"

        if not self._configure():
            yield "Model not configured."
            return

        system_prompt = prompt

        if chunks:
            user_prompt = (
                f"Question: {question}\n\n"
                f"Context chunks:\n---\n{context}\n---\n\n"
                "Answer the question using ONLY the context chunks above.\n"
                "- Cite each fact as [n, p.X] matching the chunk number and page.\n"
                "- If a value is NOT in any chunk, say it is not mentioned.\n"
                "- Never guess or fill in missing numbers."
            )
        else:
            user_prompt = question

        available = [c for c in self._chain if not self._is_rate_limited(c.provider)]
        if not available:
            self._provider_cooldown.clear()
            available = self._chain

        for cfg in available:
            client = cfg.client
            deployment = cfg.model
            provider = cfg.provider

            def _stream_call():
                return client.chat.completions.create(
                    model=deployment,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.1,
                    max_tokens=1024,
                    stream=True,
                )

            max_retries = 5 if len(available) == 1 else 3
            for attempt in range(1, max_retries + 1):
                try:
                    stream = await asyncio.to_thread(_stream_call)
                    streamed_tokens = 0
                    chunk_usage = None
                    for chunk in stream:
                        delta = chunk.choices[0].delta if chunk.choices else None
                        if delta and delta.content:
                            streamed_tokens += len(delta.content)
                            yield delta.content
                        # Capture usage from the final chunk if available
                        chunk_usage = getattr(chunk, "usage", None)
                        if chunk_usage:
                            log_llm_cost(
                                caller="stream",
                                provider=provider,
                                model=deployment,
                                prompt_tokens=getattr(chunk_usage, "prompt_tokens", 0) or 0,
                                completion_tokens=getattr(chunk_usage, "completion_tokens", 0) or 0,
                            )
                    # Estimate if no usage chunk was returned (most providers)
                    if not chunk_usage:
                        est_out = max(streamed_tokens // 4, 1)
                        log_llm_cost(
                            caller="stream",
                            provider=provider,
                            model=deployment,
                            prompt_tokens=0,
                            completion_tokens=est_out,
                            estimated=True,
                        )
                    return  # success — stop iterating providers
                except Exception as exc:
                    if self._is_429(exc) and attempt < max_retries:
                        wait = max(self._extract_retry_after(exc), 2 ** attempt)
                        logger.warning("Stream rate limited by %s (attempt %d/%d), waiting %.1fs", provider, attempt, max_retries, wait)
                        await asyncio.sleep(wait)
                        continue
                    if self._is_429(exc):
                        self._mark_rate_limited(provider, self._extract_retry_after(exc))
                    logger.warning("LLM stream provider %s failed, trying next: %s", provider, exc)
                    break  # next provider

        yield "LLM call failed."


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
