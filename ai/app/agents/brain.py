from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol
import os

from .knowledge import KnowledgeLoader
from .rerank import naive_rerank


class Tool(Protocol):
    name: str
    description: str

    async def run(self, **kwargs) -> Dict[str, Any]:
        ...


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str


class BrainAgent:
    """
    Iterative planner using knowledge.json to propose search queries, fetch chunks,
    rerank, and synthesize an answer. Up to max_iters with feedback when results are weak.
    """

    def __init__(self, tools: List[Tool], user_email_env: str = "USER_EMAIL"):
        self.tools = {t.name: t for t in tools}
        self.scratchpad: List[str] = []
        self.kb_loader = KnowledgeLoader()
        self.user_email_env = user_email_env

    def _propose_queries(self, question: str, kb: Dict[str, Any], attempt: int) -> List[str]:
        files = list((kb.get("files") or {}).keys())
        folders = list((kb.get("folders") or {}).keys())
        cues = files[:5] + folders[:5]
        base = question.strip()
        variants = [base]
        if cues:
            variants.append(base + " " + " ".join(cues[:3]))
        if attempt > 1:
            variants.append("contextual " + base)
        if attempt > 2:
            variants.append(base + " details policy process")
        return list(dict.fromkeys(variants))[:3]

    async def run(self, goal: str, user_email: Optional[str] = None, max_iters: int = 4, min_hits: int = 6) -> Dict[str, Any]:
        user_email = user_email or self._get_user_email()
        kb = self.kb_loader.load(user_email) if user_email else {}
        self.scratchpad.append(f"Loaded KB keys: files={len(kb.get('files', {}))}, folders={len(kb.get('folders', {}))}")

        collected: List[Dict[str, Any]] = []
        for it in range(1, max_iters + 1):
            queries = self._propose_queries(goal, kb, it)
            self.scratchpad.append(f"Iter {it} queries: {queries}")
            # run vector search first, fallback to text search
            for q in queries:
                tool = self.tools.get("vector_search") or self.tools.get("graph_search")
                if not tool:
                    continue
                out = await tool.run(query=q, top_k=15)
                items = out.get("items", [])
                for itx in items:
                    collected.append({"file": itx.get("file"), "text": itx.get("text"), "score": float(itx.get("score", 0.0)), "query": q})

            reranked = naive_rerank(collected, goal, top_k=15)
            avg_score = sum(c.get("score", 0.0) for c in reranked[:5]) / max(1, min(5, len(reranked)))
            self.scratchpad.append(f"Collected {len(collected)}; top5 avg score={avg_score:.4f}")
            if len(reranked) >= min_hits and avg_score > 0.2:
                llm = self.tools.get("llm_summarize")
                if llm:
                    llm_out = await llm.run(question=goal, chunks=reranked)
                    return {"goal": goal, "iterations": it, "chunks": reranked, "answer": llm_out.get("answer", ""), "scratchpad": self.scratchpad}
                answer = self._synthesize_answer(goal, reranked)
                return {"goal": goal, "iterations": it, "chunks": reranked, "answer": answer, "scratchpad": self.scratchpad}

            self.scratchpad.append("Low relevance; refining queries...")

        final = naive_rerank(collected, goal, top_k=10)
        llm = self.tools.get("llm_summarize")
        if llm and final:
            llm_out = await llm.run(question=goal, chunks=final)
            return {"goal": goal, "iterations": max_iters, "chunks": final, "answer": llm_out.get("answer", ""), "scratchpad": self.scratchpad}
        answer = self._synthesize_answer(goal, final)
        return {"goal": goal, "iterations": max_iters, "chunks": final, "answer": answer, "scratchpad": self.scratchpad}

    def _synthesize_answer(self, goal: str, chunks: List[Dict[str, Any]]) -> str:
        # Placeholder LLM call; concatenate snippets as a stub.
        parts = [f"- {c.get('file')}: { (c.get('text') or '')[:200].replace('\n',' ') }" for c in chunks[:8]]
        return "\n".join([f"Question: {goal}", "Relevant passages:"] + parts + ["\n(Stub synthesis: replace with an LLM-generated answer.)"]) 

    def _get_user_email(self) -> Optional[str]:
        return os.getenv(self.user_email_env)
