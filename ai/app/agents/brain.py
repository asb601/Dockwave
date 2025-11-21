from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol
import os
import re

from .knowledge import KnowledgeLoader
from .rerank import naive_rerank, hybrid_rerank
from app.util.log import log_event


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
    Adds groundedness check: only claim a specific answer when evidence is sufficient.
    """

    def __init__(self, tools: List[Tool], user_email_env: str = "USER_EMAIL"):
        self.tools = {t.name: t for t in tools}
        self.scratchpad: List[str] = []
        self.kb_loader = KnowledgeLoader()
        self.user_email_env = user_email_env
        # thresholds (configurable via env)
        self.conf_summarize = float(os.getenv("CONFIDENCE_SUMMARIZE", "0.30"))
        self.conf_planner = float(os.getenv("CONFIDENCE_PLANNER", "0.15"))
        self.min_hits = int(os.getenv("MIN_HITS", "6"))
        self.min_evidence = float(os.getenv("MIN_EVIDENCE", "0.20"))

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

    def _evidence_score(self, answer: str, chunks: List[Dict[str, Any]]) -> float:
        # Simple lexical grounding: share of answer tokens (>3 chars) present in sources
        src = " \n ".join([(c.get("text") or "") for c in chunks[:10]]).lower()
        toks = [t for t in re.findall(r"[a-zA-Z0-9_]+", (answer or "").lower()) if len(t) > 3]
        if not toks:
            return 0.0
        distinct = list(dict.fromkeys(toks))
        hits = sum(1 for t in distinct if t in src)
        return hits / max(1, len(distinct))

    async def _log_and_run_tool(self, tool, **kwargs):
        # Log every tool invocation with tool name and arguments
        log_event("tool.invoke", {
            "tool": getattr(tool, 'name', str(tool)),
            "description": getattr(tool, 'description', ''),
            "args": kwargs
        })
        return await tool.run(**kwargs)

    async def run(self, goal: str, user_email: Optional[str] = None, max_iters: int = 4, min_hits: int = 6) -> Dict[str, Any]:
        user_email = user_email or self._get_user_email()
        kb = self.kb_loader.load(user_email) if user_email else {}
        self.scratchpad.append(f"Loaded KB keys: files={len(kb.get('files', {}))}, folders={len(kb.get('folders', {}))}")

        collected: List[Dict[str, Any]] = []
        iteration_metrics: List[Dict[str, Any]] = []
        for it in range(1, max_iters + 1):
            queries = self._propose_queries(goal, kb, it)
            self.scratchpad.append(f"Iter {it} queries: {queries}")

            vtool = self.tools.get("vector_search")
            gtool = self.tools.get("graph_search")

            before_count = len(collected)
            for q in queries:
                if vtool:
                    vout = await self._log_and_run_tool(vtool, query=q, top_k=15)
                    for i, itx in enumerate(vout.get("items", [])):
                        itx = dict(itx)
                        itx.setdefault("source", "vector")
                        itx.setdefault("initial_rank", i)
                        itx["query"] = q
                        collected.append(itx)
                if gtool:
                    gout = await self._log_and_run_tool(gtool, query=q, top_k=10)
                    for i, itx in enumerate(gout.get("items", [])):
                        itx = dict(itx)
                        itx.setdefault("source", "graph")
                        itx.setdefault("initial_rank", i)
                        itx["query"] = q
                        collected.append(itx)
            added = len(collected) - before_count

            reranked = hybrid_rerank(collected, goal, top_k=15) if collected else []
            if not reranked:
                reranked = naive_rerank(collected, goal, top_k=15)
            topN = reranked[:5]
            scores = [c.get("rerank_score") for c in topN if isinstance(c.get("rerank_score"), (int, float))]
            if not scores:
                scores = [float(c.get("score", 0.0)) for c in topN]
            confidence = sum(scores) / max(1, len(scores)) if scores else 0.0

            metric = {
                "iter": it,
                "queries": queries,
                "added_items": added,
                "total_items": len(collected),
                "top_scores": scores,
                "confidence": confidence,
                "top_sources": [c.get("file") for c in topN],
            }
            iteration_metrics.append(metric)
            log_event("iteration.eval", metric)

            self.scratchpad.append(f"Collected {len(collected)}; confidence={confidence:.4f}")
            if len(reranked) >= (min_hits or self.min_hits) and confidence > self.conf_summarize:
                llm = self.tools.get("llm_summarize")
                if llm:
                    llm_out = await self._log_and_run_tool(llm, question=goal, chunks=reranked)
                    answer = llm_out.get("answer", "")
                    ev = self._evidence_score(answer, reranked)
                    status = "grounded" if ev >= self.min_evidence else "insufficient"
                    answer_type = "grounded" if status == "grounded" else "generalized"
                    if status == "insufficient":
                        answer = (
                            "The documents do not contain a specific answer to this question. "
                            "Based on limited evidence, here is a general response:\n\n" + (answer or "")
                        )
                    log_event("answer.eval", {
                        "iterations": it,
                        "confidence": confidence,
                        "evidence_score": ev,
                        "status": status,
                        "chunks": len(reranked),
                    })
                    return {
                        "goal": goal,
                        "iterations": it,
                        "iteration_metrics": iteration_metrics,
                        "chunks": reranked,
                        "answer": answer,
                        "answer_type": answer_type,
                        "confidence": confidence,
                        "evidence_score": ev,
                        "status": status,
                        "scratchpad": self.scratchpad,
                    }
                # No LLM tool: synthesize stub
                answer = self._synthesize_answer(goal, reranked)
                return {"goal": goal, "iterations": it, "chunks": reranked, "answer": answer, "confidence": confidence, "status": "stub", "scratchpad": self.scratchpad}

            self.scratchpad.append("Low confidence; refining queries...")

        final = hybrid_rerank(collected, goal, top_k=10) if collected else []
        if not final:
            final = naive_rerank(collected, goal, top_k=10)
        llm = self.tools.get("llm_summarize")
        if llm and final:
            llm_out = await self._log_and_run_tool(llm, question=goal, chunks=final)
            answer = llm_out.get("answer", "")
            ev = self._evidence_score(answer, final)
            status = "grounded" if ev >= self.min_evidence else "insufficient"
            answer_type = "grounded" if status == "grounded" else "generalized"
            if status == "insufficient":
                answer = (
                    "The documents do not contain a specific answer to this question. "
                    "Based on limited evidence, here is a general response:\n\n" + (answer or "")
                )
            log_event("answer.eval", {"iterations": max_iters, "confidence": None, "evidence_score": ev, "status": status, "chunks": len(final)})
            return {
                "goal": goal,
                "iterations": max_iters,
                "iteration_metrics": iteration_metrics,
                "chunks": final,
                "answer": answer,
                "answer_type": answer_type,
                "confidence": None,
                "evidence_score": ev,
                "status": status,
                "scratchpad": self.scratchpad,
            }
        if llm and not final:
            llm_out = await self._log_and_run_tool(llm, question=goal, chunks=[])
            answer = llm_out.get("answer", "")
            # Force explicit disclaimer when no evidence
            answer = (
                "The documents do not contain a specific answer to this question. "
                "Based on general knowledge, here is a broad response:\n\n" + (answer or "")
            )
            log_event("answer.eval", {"iterations": max_iters, "confidence": None, "evidence_score": 0.0, "status": "insufficient", "chunks": 0})
            return {
                "goal": goal,
                "iterations": max_iters,
                "iteration_metrics": iteration_metrics,
                "chunks": [],
                "answer": answer,
                "answer_type": "generalized",
                "confidence": None,
                "evidence_score": 0.0,
                "status": "insufficient",
                "scratchpad": self.scratchpad,
            }
        answer = self._synthesize_answer(goal, final)
        return {
            "goal": goal,
            "iterations": max_iters,
            "iteration_metrics": iteration_metrics,
            "chunks": final,
            "answer": answer,
            "answer_type": "stub",
            "confidence": None,
            "status": "stub",
            "scratchpad": self.scratchpad,
        }

    def _synthesize_answer(self, goal: str, chunks: List[Dict[str, Any]]) -> str:
        parts = [f"- {c.get('file')}: { (c.get('text') or '')[:200].replace('\n',' ') }" for c in chunks[:8]]
        return "\n".join([f"Question: {goal}", "Relevant passages:"] + parts + ["\n(Stub synthesis: replace with an LLM-generated answer.)"]) 

    def _get_user_email(self) -> Optional[str]:
        return os.getenv(self.user_email_env)
