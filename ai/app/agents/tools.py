from __future__ import annotations
import cohere
from dataclasses import dataclass
import os
from typing import Any, Dict, List, Optional
import json
from neo4j import GraphDatabase
from app.util.log import log_event, estimate_cost
from app.util.prompts import RouterPrompt,summarize_prompt
import dotenv   

dotenv.load_dotenv()

import requests

# Optional embeddings
try:
    from sentence_transformers import SentenceTransformer  # type: ignore
except Exception:  # pragma: no cover
    SentenceTransformer = None  # type: ignore

@dataclass
class LLMRouterTool:
    name: str = "llm_router"
    description: str = "LLM-based router that decides which tool to call and with what arguments."
    llm: Any = None
    prompt: Any = None

    def __post_init__(self):
        if self.llm is None:
            self.llm = LLMTool()

        # FIX: RouterPrompt must be instantiated or be a function that returns a template
        # If it's a class → instantiate it
        if callable(RouterPrompt):
            self.prompt = RouterPrompt()
        else:
            self.prompt = RouterPrompt  # if it's already a string/template

    async def run(self, question: str) -> Dict[str, Any]:
        """
        Calls the LLM to get a routing plan for the given question.
        Returns a dict with the LLM's answer (a JSON plan string).
        """
        # FIX: Build the prompt with the question
        if hasattr(self.prompt, "build"):
            used_prompt = self.prompt.build(question)
        else:
            used_prompt = self.prompt.format(question=question) if "{question}" in self.prompt else self.prompt

        # FIX: call the LLM properly with empty chunks since routing doesn't need documents
        response = await self.llm.run(
            question=question,
            prompt=used_prompt,
            chunks=[]
        )

        # FIX: normalize output
        if isinstance(response, dict) and "answer" in response:
            return {"answer": response["answer"]}

        if hasattr(response, "choices"):
            # OpenAI-like response
            try:
                return {"answer": response.choices[0].message.content}
            except:
                pass

        # fallback
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
        api_key = os.getenv("embeedings_api")
        if not api_key:
            raise RuntimeError("Cohere API key not set in environment (embeedings_api or COHERE_API_KEY)")
        co = cohere.Client(api_key)
        # Lazy model load (cached on the class)
        response = co.embed(
            texts=[text],
            input_type="search_query",
            model=self.model_name,
            embedding_types=["float"]
        )
        # Use .float_ to get the float embeddings
        return response.embeddings.float_[0]

    async def run(self, query: str, top_k: int = 15) -> Dict[str, Any]:
        qv = self._embed(query)
        # Connect
        try:
            driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        except Exception as e:
            return {"items": [], "error": f"neo4j_connect: {e}"}
        try:
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
            return {"items": [], "error": f"neo4j_query: {e}"}
        finally:
            try:
                driver.close()
            except Exception:
                pass


# Keep GraphSearchTool as fallback text search
@dataclass
class GraphSearchTool:
    uri: str
    user: str
    password: str
    name: str = "graph_search"
    description: str = "Search Neo4j chunks and files by text query (simple CONTAINS search)."

    async def run(self, query: str, top_k: int = 5) -> Dict[str, Any]:
        try:
            driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        except Exception as e:
            return {"items": [], "error": f"neo4j_connect: {e}"}
        try:
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
            return {"items": [], "error": f"neo4j_query: {e}"}
        finally:
            try:
                driver.close()
            except Exception:
                pass


# LLM tool via Azure OpenAI (fallback to stub if not configured)
try:
    import openai  # type: ignore
    from openai import AzureOpenAI, OpenAI  # type: ignore
except Exception:  # pragma: no cover
    openai = None  # type: ignore
    AzureOpenAI = None  # type: ignore
    OpenAI = None  # type: ignore


@dataclass
class LLMTool:
    name: str = "llm_summarize"
    description: str = "Summarize with citations from provided chunks. Uses Azure/OpenAI if configured; otherwise returns a stub."
    model_name: str = "gpt-4o-mini"  # default deployment/model name

    def __post_init__(self):
        self._client = None
        self._provider = None

    def _configured(self) -> bool:
        import os
        
        if openai is None:
            print("enetered configured This is the reason ")
            return False
        # Azure config via explicit env vars
        azure_key = os.getenv("AZURE_OPENAI_API_KEY")
        azure_base = os.getenv("AZURE_OPENAI_API_BASE")  # should be like https://<resource>.openai.azure.com/
        azure_model = os.getenv("AZURE_OPENAI_MODEL", self.model_name)  # deployment name
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
                # Store deployment name
                self._deployment = azure_model
                return True
            except Exception:
                return False
        # Public OpenAI fallback
        public_key = os.getenv("AZURE_OPENAI_API_KEY")
        if public_key and OpenAI is not None:
            try:
                self._client = OpenAI(api_key=public_key)
                self._provider = "openai"
                self._deployment = os.getenv("OPENAI_MODEL", self.model_name)
                return True
            except Exception:
                return False
        return False

    async def run(self, question: str, prompt: str, chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        cites: List[str] = []
        print("api of openai", os.getenv("AZURE_OPENAI_API_KEY"),"openai from self",self._client,"self._configured()",self._configured())
        for i, ch in enumerate(chunks[:12]):
            cites.append(f"[{i+1}] {ch.get('file')}: {(ch.get('text') or '')[:200].replace('\n',' ')}")
        context = "\n".join(cites) or "(no context)"

        if self._client is None and not self._configured():
            log_event("llm.unconfigured", {"provider": "none"}, os.getenv("AZURE_OPENAI_API_KEY"))
            return {"answer": "Model not configured.", "provider": "stub"}

        deployment = getattr(self, "_deployment", self.model_name)
        system_prompt = prompt
        user_prompt = f"Question: {question}\n\nContext:\n{context}\n\nAnswer concisely. Include [n] citations only when grounded in the context."

        try:
            resp = self._client.chat.completions.create(
                model=deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_tokens=512,
            )
            txt = resp.choices[0].message.content if resp.choices else ""
            # Token usage (field names depend on provider)
            usage = getattr(resp, "usage", None)
            prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
            completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
            total_tokens = getattr(usage, "total_tokens", None) if usage else None
            cost = None
            if isinstance(prompt_tokens, int) and isinstance(completion_tokens, int):
                cost = estimate_cost(prompt_tokens, completion_tokens)
            log_event("llm.call", {
                "provider": self._provider or "openai",
                "deployment": deployment,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "estimated_cost_usd": cost,
            })
            return {"answer": txt, "provider": self._provider or "openai", "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": total_tokens, "estimated_cost_usd": cost}}
        except Exception as e:
            log_event("llm.error", {"provider": self._provider or "openai", "deployment": deployment, "error": str(e)})
            return {"answer": f"LLM error: {e}", "provider": "stub-error"}




from dataclasses import dataclass
from typing import Any, Dict
from datetime import datetime
import requests
from app.util.log import log_event


@dataclass
class GetMeetingsTool:
    """
    Always uses http://localhost:3000 as API base URL.
    Fetches calendar events between start & end ISO8601 dates.
    """
    api_base_url: str = "http://localhost:3000"
    name: str = "get_meetings"
    description: str = (
        "Fetch all calendar events (with tasks) for the current user from the Next.js API. "
        "Accepts start and end date as ISO8601 strings."
    )

    async def run(self, start: str, end: str) -> Dict[str, Any]:
        print(f"[GetMeetingsTool] Called with start={start}, end={end}")
        print(f"[GetMeetingsTool] api_base_url = {self.api_base_url}")

        log_event(
            "tool.invoke",
            {"tool": self.name, "description": self.description, "start": start, "end": end},
        )

        # ---------------------------------------------------------
        # Helper to convert date → full ISO8601 UTC format
        # ---------------------------------------------------------
        def to_iso8601_z(dt: str, is_start: bool) -> str:
            # If already ISO8601 with Z suffix -> keep as-is
            if "T" in dt and dt.endswith("Z"):
                return dt

            try:
                parsed = datetime.fromisoformat(dt)

                if is_start:
                    return parsed.strftime("%Y-%m-%dT00:00:00.000Z")
                else:
                    return parsed.strftime("%Y-%m-%dT23:59:59.000Z")

            except Exception:
                # If format is weird, send raw — backend may handle
                return dt

        formatted_start = to_iso8601_z(start, is_start=True)
        formatted_end = to_iso8601_z(end, is_start=False)

        # -------------------------------
        # Construct final request
        # -------------------------------
        print(os.getenv("NEXT_API_BASE"))
        url = f"{os.getenv('NEXT_API_BASE')}/api/calendar/events/eventsALL"
        print(f"[GetMeetingsTool] Final request URL: {url}")

        params = {
            "start": formatted_start,
            "end": formatted_end,
        }

        print(f"[GetMeetingsTool] Query params: {params}")

        headers = {"Content-Type": "application/json"}

        # -------------------------------
        # Send HTTP Request
        # -------------------------------
        try:
            response = requests.get(url, headers=headers, params=params, timeout=10)
            print(f"[GetMeetingsTool] Response status: {response.status_code}")

            if not response.ok:
                print(f"[GetMeetingsTool] Error response: {response.text}")
                return {"error": response.text, "status": response.status_code}

            return response.json()

        except Exception as e:
            print(f"[GetMeetingsTool] Exception: {str(e)}")
            return {"error": str(e)}
