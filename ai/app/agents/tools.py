from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import json
from datetime import datetime

import cohere
import requests
from neo4j import GraphDatabase

from app.util.log import log_event, estimate_cost
from app.util.prompts import RouterPrompt, summarize_prompt
from app.services.entity_extraction import EntityExtractor

logger = logging.getLogger("intellidoc.tools")


@dataclass
class LLMRouterTool:
    name: str = "llm_router"
    description: str = "LLM-based router that decides which tool to call and with what arguments."
    llm: Any = None
    prompt: Any = None

    def __post_init__(self):
        if self.llm is None:
            self.llm = LLMTool()

        if callable(RouterPrompt):
            self.prompt = RouterPrompt()
        else:
            self.prompt = RouterPrompt

    async def run(self, question: str) -> Dict[str, Any]:
        """
        Calls the LLM to get a routing plan for the given question.
        Returns a dict with the LLM's answer (a JSON plan string).
        """
        if hasattr(self.prompt, "build"):
            used_prompt = self.prompt.build(question)
        else:
            used_prompt = self.prompt.format(question=question) if "{question}" in self.prompt else self.prompt

        response = await self.llm.run(
            question=question,
            prompt=used_prompt,
            chunks=[]
        )

        if isinstance(response, dict) and "answer" in response:
            return {"answer": response["answer"]}

        if hasattr(response, "choices"):
            try:
                return {"answer": response.choices[0].message.content}
            except (IndexError, AttributeError):
                pass

        return {"answer": str(response)}


@dataclass
class VectorSearchTool:
    uri: str
    user: str
    password: str
    index_name: str = "chunk_embedding_index"
    model_name: str = "embed-english-v3.0"
    name: str = "vector_search"
    description: str = "Vector search over Chunk.embedding using Neo4j vector index."

    def _embed(self, text: str) -> List[float]:
        api_key = os.getenv("COHERE_API_KEY") or os.getenv("embeedings_api")
        if not api_key:
            raise RuntimeError("Cohere API key not set (COHERE_API_KEY)")
        co = cohere.Client(api_key)
        response = co.embed(
            texts=[text],
            input_type="search_query",
            model=self.model_name,
            embedding_types=["float"]
        )
        return response.embeddings.float_[0]

    async def run(self, query: str, top_k: int = 15) -> Dict[str, Any]:
        qv = self._embed(query)
        driver = None
        try:
            driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            with driver.session() as sess:
                cypher = (
                    "CALL db.index.vector.queryNodes($index, $k, $vec) YIELD node, score "
                    "MATCH (f:File)-[:HAS_CHUNK]->(node) "
                    "RETURN f.name AS file, node.text AS text, score "
                    "ORDER BY score DESC"
                )
                rows = sess.run(cypher, index=self.index_name, k=top_k, vec=qv)
                items: List[Dict[str, Any]] = []
                for i, r in enumerate(rows):
                    items.append({
                        "file": r["file"],
                        "text": r["text"],
                        "score": float(r["score"]),
                        "source": "vector",
                        "initial_rank": i,
                    })
                return {"items": items}
        except Exception as e:
            logger.error("Vector search failed: %s", e)
            return {"items": [], "error": f"neo4j_query: {e}"}
        finally:
            if driver:
                try:
                    driver.close()
                except Exception:
                    pass


@dataclass
class GraphSearchTool:
    uri: str
    user: str
    password: str
    name: str = "graph_search"
    description: str = "Search Neo4j chunks and files by text query (simple CONTAINS search)."

    async def run(self, query: str, top_k: int = 5) -> Dict[str, Any]:
        driver = None
        try:
            driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            with driver.session() as sess:
                cypher = (
                    "MATCH (f:File)-[:HAS_CHUNK]->(c:Chunk) "
                    "WHERE toLower(c.text) CONTAINS toLower($q) "
                    "RETURN f.name AS file, c.text AS text LIMIT $k"
                )
                rows = sess.run(cypher, q=query, k=top_k)
                items: List[Dict[str, Any]] = []
                for i, r in enumerate(rows):
                    items.append({
                        "file": r["file"],
                        "text": r["text"],
                        "source": "graph",
                        "initial_rank": i,
                    })
                return {"items": items}
        except Exception as e:
            logger.error("Graph search failed: %s", e)
            return {"items": [], "error": f"neo4j_query: {e}"}
        finally:
            if driver:
                try:
                    driver.close()
                except Exception:
                    pass


@dataclass
class EntityGraphSearchTool:
    """Graph traversal search: extracts entities from the query, then
    traverses Entity→Chunk→File relationships in Neo4j for multi-hop retrieval."""
    uri: str
    user: str
    password: str
    name: str = "entity_graph_search"
    description: str = (
        "Search Neo4j knowledge graph by extracting entities from the query "
        "and traversing entity relationships across documents."
    )

    def __post_init__(self):
        self._extractor = EntityExtractor()

    async def run(self, query: str, top_k: int = 10) -> Dict[str, Any]:
        # Step 1: Extract entities from the query
        entities = self._extractor.extract(query)
        entity_names = [e["name"] for e in entities]

        if not entity_names:
            # Fallback: use significant words from the query as entity names
            entity_names = [
                w for w in query.split()
                if len(w) > 3 and w.lower() not in {
                    "what", "when", "where", "which", "that", "this",
                    "from", "with", "about", "does", "have", "been",
                    "will", "would", "could", "should", "their", "there",
                }
            ][:5]

        if not entity_names:
            return {"items": [], "entities_searched": []}

        from app.services.graph import GraphClient
        graph = GraphClient()
        try:
            items = graph.entity_graph_search(
                query_entities=entity_names,
                top_k=top_k,
            )
            return {
                "items": items,
                "entities_searched": entity_names,
                "entities_extracted": entities,
            }
        except Exception as e:
            logger.error("Entity graph search failed: %s", e)
            return {"items": [], "error": str(e), "entities_searched": entity_names}
        finally:
            graph.close()


# LLM tool via Azure OpenAI (fallback to stub if not configured)
try:
    import openai  # type: ignore
    from openai import AzureOpenAI, OpenAI  # type: ignore
except ImportError:  # pragma: no cover
    openai = None  # type: ignore
    AzureOpenAI = None  # type: ignore
    OpenAI = None  # type: ignore


@dataclass
class LLMTool:
    name: str = "llm_summarize"
    description: str = "Summarize with citations from provided chunks. Uses Azure/OpenAI if configured; otherwise returns a stub."
    model_name: str = "gpt-4o-mini"

    def __post_init__(self):
        self._client = None
        self._provider = None
        self._deployment = self.model_name

    def _configured(self) -> bool:
        if openai is None:
            logger.warning("openai package not installed")
            return False

        # Azure config
        azure_key = os.getenv("AZURE_OPENAI_API_KEY")
        azure_base = os.getenv("AZURE_OPENAI_API_BASE")
        azure_model = os.getenv("AZURE_OPENAI_MODEL", self.model_name)
        azure_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-05-01-preview")
        if azure_key and azure_base:
            if AzureOpenAI is None:
                return False
            try:
                self._client = AzureOpenAI(
                    api_version=azure_version,
                    azure_endpoint=azure_base.rstrip("/"),
                    api_key=azure_key,
                )
                self._provider = "azure-openai"
                self._deployment = azure_model
                return True
            except Exception:
                logger.exception("Failed to init AzureOpenAI client")
                return False

        # Public OpenAI fallback
        public_key = os.getenv("OPENAI_API_KEY")
        if public_key and OpenAI is not None:
            try:
                self._client = OpenAI(api_key=public_key)
                self._provider = "openai"
                self._deployment = os.getenv("OPENAI_MODEL", self.model_name)
                return True
            except Exception:
                logger.exception("Failed to init OpenAI client")
                return False
        return False

    async def run(self, question: str, prompt: str, chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        cites: List[str] = []
        for i, ch in enumerate(chunks[:12]):
            cites.append(f"[{i+1}] {ch.get('file', 'unknown')}: {(ch.get('text') or '')[:200].replace(chr(10), ' ')}")
        context = "\n".join(cites) or "(no context)"

        if self._client is None and not self._configured():
            log_event("llm.unconfigured", {"provider": "none"})
            return {"answer": "Model not configured.", "provider": "stub"}

        system_prompt = prompt
        user_prompt = f"Question: {question}\n\nContext:\n{context}\n\nAnswer concisely. Include [n] citations only when grounded in the context."

        try:
            resp = self._client.chat.completions.create(
                model=self._deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_tokens=512,
            )
            txt = resp.choices[0].message.content if resp.choices else ""
            usage = getattr(resp, "usage", None)
            prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
            completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
            total_tokens = getattr(usage, "total_tokens", None) if usage else None
            cost = None
            if isinstance(prompt_tokens, int) and isinstance(completion_tokens, int):
                cost = estimate_cost(prompt_tokens, completion_tokens)
            log_event("llm.call", {
                "provider": self._provider or "openai",
                "deployment": self._deployment,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "estimated_cost_usd": cost,
            })
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
        except Exception as e:
            log_event("llm.error", {
                "provider": self._provider or "openai",
                "deployment": self._deployment,
                "error": str(e),
            })
            logger.exception("LLM call failed")
            return {"answer": f"LLM error: {e}", "provider": "stub-error"}


@dataclass
class GetMeetingsTool:
    """Fetches calendar events between start & end ISO8601 dates."""
    api_base_url: str = "http://localhost:3000"
    name: str = "get_meetings"
    description: str = (
        "Fetch all calendar events (with tasks) for the current user from the Next.js API. "
        "Accepts start and end date as ISO8601 strings."
    )

    async def run(self, start: str, end: str) -> Dict[str, Any]:
        logger.info("GetMeetingsTool called: start=%s, end=%s", start, end)

        log_event(
            "tool.invoke",
            {"tool": self.name, "description": self.description, "start": start, "end": end},
        )

        def to_iso8601_z(dt: str, is_start: bool) -> str:
            if "T" in dt and dt.endswith("Z"):
                return dt
            try:
                parsed = datetime.fromisoformat(dt)
                if is_start:
                    return parsed.strftime("%Y-%m-%dT00:00:00.000Z")
                else:
                    return parsed.strftime("%Y-%m-%dT23:59:59.000Z")
            except (ValueError, TypeError):
                return dt

        formatted_start = to_iso8601_z(start, is_start=True)
        formatted_end = to_iso8601_z(end, is_start=False)

        # Use the passed api_base_url, not os.getenv
        url = f"{self.api_base_url}/api/calendar/events/eventsALL"
        params = {"start": formatted_start, "end": formatted_end}
        headers = {"Content-Type": "application/json"}

        try:
            response = requests.get(url, headers=headers, params=params, timeout=10)
            if not response.ok:
                logger.warning("GetMeetingsTool error: status=%d body=%s", response.status_code, response.text[:200])
                return {"error": response.text, "status": response.status_code}
            return response.json()
        except requests.Timeout:
            logger.error("GetMeetingsTool timed out")
            return {"error": "Request to calendar API timed out"}
        except Exception as e:
            logger.exception("GetMeetingsTool failed")
            return {"error": str(e)}
