from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from neo4j import GraphDatabase

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
        driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        try:
            with driver.session() as sess:
                cypher = (
                    "CALL db.index.vector.queryNodes($index, $k, $vec) YIELD node, score "
                    "MATCH (f:File)-[:HAS_CHUNK]->(node) "
                    "RETURN f.name AS file, node.text AS text, score "
                    "ORDER BY score DESC"
                )
                rows = sess.run(cypher, index=self.index_name, k=top_k, vec=qv)
                items = [{"file": r["file"], "text": r["text"], "score": float(r["score"]) } for r in rows]
                return {"items": items}
        finally:
            driver.close()


# Keep GraphSearchTool as fallback text search
@dataclass
class GraphSearchTool:
    uri: str
    user: str
    password: str
    name: str = "graph_search"
    description: str = "Search Neo4j chunks and files by text query (simple CONTAINS search)."

    async def run(self, query: str, top_k: int = 5) -> Dict[str, Any]:
        driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        try:
            with driver.session() as sess:
                cypher = (
                    "MATCH (f:File)-[:HAS_CHUNK]->(c:Chunk) "
                    "WHERE toLower(c.text) CONTAINS toLower($q) "
                    "RETURN f.name AS file, c.text AS text LIMIT $k"
                )
                rows = sess.run(cypher, q=query, k=top_k)
                items = [{"file": r["file"], "text": r["text"]} for r in rows]
                return {"items": items}
        finally:
            driver.close()


# Optional LLM tool (stub); wire to Gemini/OpenAI later
try:
    import google.generativeai as genai  # type: ignore
except Exception:  # pragma: no cover
    genai = None  # type: ignore


@dataclass
class LLMTool:
    name: str = "llm_summarize"
    description: str = "Summarize with citations from provided chunks. Uses Gemini if configured; otherwise returns a stub."
    model_name: str = "gemini-1.5-flash"

    def _configured(self) -> bool:
        return genai is not None and bool(__import__("os").getenv("GEMINI_API_KEY"))

    async def run(self, question: str, chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        # Build a citations block
        cites = []
        for i, ch in enumerate(chunks[:12]):
            cites.append(f"[{i+1}] {ch.get('file')}: {(ch.get('text') or '')[:200].replace('\n',' ')}")
        context = "\n".join(cites)

        if not self._configured():
            answer = f"Q: {question}\n\nContext:\n{context}\n\n(Stub) Provide a concise answer using the context above."
            return {"answer": answer, "provider": "stub"}

        import os
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        model = genai.GenerativeModel(self.model_name)
        prompt = (
            "You are a retrieval-augmented assistant. Use the provided context chunks from multiple files.\n"
            "Do not limit to one file; drop unrelated chunks; cite sources using [n] markers.\n\n"
            f"Question: {question}\n\nContext:\n{context}\n\nAnswer:"
        )
        resp = model.generate_content(prompt, generation_config={"temperature": 0.2, "max_output_tokens": 512})
        text = getattr(resp, "text", "")
        return {"answer": text or "", "provider": "gemini"}


@dataclass
class SummarizeTool:
    name: str = "summarize"
    description: str = "Summarize a query using a trivial heuristic (stub)."

    async def run(self, query: str) -> Dict[str, Any]:
        return {"summary": f"Summary for: {query}"}
