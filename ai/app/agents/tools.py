from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from neo4j import GraphDatabase
from app.util.log import log_event, estimate_cost

# Optional embeddings
try:
    from sentence_transformers import SentenceTransformer  # type: ignore
except Exception:  # pragma: no cover
    SentenceTransformer = None  # type: ignore


@dataclass
class VectorSearchTool:
    uri: str
    user: str
    password: str
    index_name: str = "chunk_embedding_index"
    model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    name: str = "vector_search"
    description: str = "Vector search over Chunk.embedding using Neo4j vector index."

    def _embed(self, text: str) -> List[float]:
        if SentenceTransformer is None:
            raise RuntimeError("sentence-transformers not installed")
        # Lazy model load (cached on the class)
        if not hasattr(self, "_model"):
            setattr(self, "_model", SentenceTransformer(self.model_name))  # type: ignore
        model = getattr(self, "_model")  # type: ignore
        vec = model.encode([text], normalize_embeddings=True)[0]
        return vec.astype("float32").tolist()  # type: ignore

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
        public_key = os.getenv("OPENAI_API_KEY")
        if public_key and OpenAI is not None:
            try:
                self._client = OpenAI(api_key=public_key)
                self._provider = "openai"
                self._deployment = os.getenv("OPENAI_MODEL", self.model_name)
                return True
            except Exception:
                return False
        return False

    async def run(self, question: str, chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        cites: List[str] = []
        for i, ch in enumerate(chunks[:12]):
            cites.append(f"[{i+1}] {ch.get('file')}: {(ch.get('text') or '')[:200].replace('\n',' ')}")
        context = "\n".join(cites) or "(no context)"

        if self._client is None and not self._configured():
            log_event("llm.unconfigured", {"provider": "none"})
            return {"answer": "Model not configured.", "provider": "stub"}

        deployment = getattr(self, "_deployment", self.model_name)
        system_prompt = (
    "You are a helpful, friendly, and knowledgeable assistant. Your primary goal is to be useful and supportive in your conversations.\n\n"
    "You have access to a special function that can search through uploaded documents (like PDFs) to find relevant information. Your behavior should follow these core principles:\n\n"
    "1.  **Seamless Integration:** Use the document context when it is provided and relevant. Do not announce \"the documents say...\" or \"based on the context...\" unless citing a specific source. Weave the information naturally into your response.\n"
    "    *   **For citing sources:** When you directly quote or paraphrase a specific fact from a document, simply add a citation like `[n]` at the end of the relevant sentence.\n\n"
    "2.  **Confident General Knowledge:** If no relevant context is found for a query, or if the query is general, answer directly and confidently using your own knowledge. Do not mention the absence of documents. Just be a helpful assistant.\n\n"
    "3.  **Strict Grounding & Honesty:** Never hallucinate or invent information from the documents. If the user asks a specific question that should be in the documents but you cannot find the answer, say so plainly and offer to help with what you *can* do.\n"
    "    *   *Example:* \"I've looked through the documents, but I couldn't find a specific mention of [X]. However, based on the available information, [Y] is discussed. Would you like me to go into detail on that?\"\n\n"
    "4.  **Tone:** Always be warm, engaging, and proactive. Your tone should feel like a knowledgeable and friendly colleague.\n\n"
    "**Handling Specific Scenarios:**\n\n"
    "*   **User asks about the files/context itself:** If a user asks \"What files do I have?\" or \"What can you see?\", provide a concise, friendly summary of the available document contexts (e.g., \"You have a few research papers uploaded, one about neural networks and another about climate data. How can I help you with them?\"). *This simulates the system knowing its own \"knowledge base.\"*"
   )
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


@dataclass
class SummarizeTool:
    name: str = "summarize"
    description: str = "Summarize a query using a trivial heuristic (stub)."

    async def run(self, query: str) -> Dict[str, Any]:
        return {"summary": f"Summary for: {query}"}
