from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Union

from app.util.prompts import summarize_prompt
from app.util.log import log_event
from .knowledge import KnowledgeLoader
from .rerank import naive_rerank, hybrid_rerank
from app.core.tool_registry import Tool, ToolRegistry
from app.core.orchestrator import AgentOrchestrator

logger = logging.getLogger("intellidoc.brain")


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str


class BrainAgent:
    """
    Iterative RAG agent that routes goals to the appropriate tools, collects
    evidence through multiple search passes, reranks results, and synthesises
    a grounded answer.

    Accepts either a :class:`ToolRegistry` (preferred) or a plain list of
    tools for backward compatibility with existing call-sites.
    """

    def __init__(
        self,
        tools: Union[ToolRegistry, List[Tool]],
        user_email_env: str = "USER_EMAIL",
    ) -> None:
        # Support both ToolRegistry (new) and list-of-tools (legacy)
        if isinstance(tools, ToolRegistry):
            self._registry = tools
        else:
            self._registry = ToolRegistry()
            for t in tools:
                self._registry.register(t)

        self._orchestrator = AgentOrchestrator(self._registry)
        # Legacy attribute kept for any code that directly accesses brain.tools
        self.tools = self._registry.all()

        self.scratchpad: List[str] = []
        self.kb_loader = KnowledgeLoader()
        self.user_email_env = user_email_env

        # Thresholds (overridable via environment variables)
        self.conf_summarize = float(os.getenv("CONFIDENCE_SUMMARIZE", "0.30"))
        self.conf_planner = float(os.getenv("CONFIDENCE_PLANNER", "0.15"))
        self.min_hits = int(os.getenv("MIN_HITS", "6"))
        self.min_evidence = float(os.getenv("MIN_EVIDENCE", "0.20"))

    # ------------------------------------------------------------------
    # Query proposal helpers
    # ------------------------------------------------------------------

    def _propose_queries(self, question: str, kb: Dict[str, Any], attempt: int) -> List[str]:
        """Generate 1-3 query variants, incorporating KB context on later attempts."""
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

    # ------------------------------------------------------------------
    # Evidence scoring
    # ------------------------------------------------------------------

    def _evidence_score(self, answer: str, chunks: List[Dict[str, Any]]) -> float:
        """
        Lexical grounding score: fraction of distinct answer tokens (>3 chars)
        that appear in the top-10 source chunks.
        """
        src = " \n ".join([(c.get("text") or "") for c in chunks[:10]]).lower()
        toks = [t for t in re.findall(r"[a-zA-Z0-9_]+", (answer or "").lower()) if len(t) > 3]
        if not toks:
            return 0.0
        distinct = list(dict.fromkeys(toks))
        hits = sum(1 for t in distinct if t in src)
        return hits / max(1, len(distinct))

    # ------------------------------------------------------------------
    # Tool invocation
    # ------------------------------------------------------------------

    async def _log_and_run_tool(self, tool: Any, **kwargs: Any) -> Dict[str, Any]:
        """Invoke *tool*, logging the call with redacted chunk content."""
        log_args = dict(kwargs)
        if "chunks" in log_args:
            log_args["chunks"] = [
                {"file": c.get("file"), "source": c.get("source", ""), "score": c.get("score")}
                for c in log_args["chunks"]
            ]
            log_args["chunk_count"] = len(kwargs["chunks"])
        log_event("tool.invoke", {
            "tool": getattr(tool, "name", str(tool)),
            "description": getattr(tool, "description", ""),
            "args": log_args,
        })
        return await tool.run(**kwargs)

    # ------------------------------------------------------------------
    # Main orchestration entry point
    # ------------------------------------------------------------------

    async def run(
        self,
        goal: str,
        user_email: Optional[str] = None,
        max_iters: int = 4,
        min_hits: int = 6,
    ) -> Dict[str, Any]:
        """
        Route *goal* to the appropriate tools and return a synthesised answer.

        Uses the AgentOrchestrator to decide which tools to invoke, then
        delegates to :meth:`graph_rag` and/or :meth:`get_meetings` as needed.
        """
        logger.info("BrainAgent.run started  goal=%r", goal)
        user_email = user_email or self._get_user_email()

        from app.util.log import log_brain_event

        # Delegate routing to the orchestrator
        plan = await self._orchestrator.route(goal)
        log_brain_event("orchestration_plan", {"goal": goal, "plan": plan, "user_email": user_email})

        graph_rag_result: Optional[Dict[str, Any]] = None
        meetings_result: Optional[Dict[str, Any]] = None

        if plan.get("graph_rag"):
            graph_rag_result = await self.graph_rag(goal, user_email, max_iters, min_hits)
            self.scratchpad.append(f"graph_rag result: {graph_rag_result}")

        if plan.get("get_meetings"):
            meetings_result = await self.get_meetings(goal)
            self.scratchpad.append(f"get_meetings result: {meetings_result}")

        # No tool selected – call LLM directly for a general reply
        if not plan.get("graph_rag") and not plan.get("get_meetings"):
            logger.info("No tool selected; using llm_summarize for a direct reply")
            llm_tool = self._registry.get("llm_summarize")
            if llm_tool:
                llm_out = await self._log_and_run_tool(llm_tool, question=goal, prompt=summarize_prompt, chunks=[])
                self.scratchpad.append("No tool selected; used llm_summarize for a direct reply.")
                return {"goal": goal, "answer": llm_out.get("answer", "").strip(), "scratchpad": self.scratchpad}
            answer = self._synthesize_answer(goal, [])
            self.scratchpad.append("No tool selected and no LLM configured; returning stub.")
            return {"goal": goal, "answer": answer, "scratchpad": self.scratchpad}

        # At least one tool ran – prefer graph_rag answer, fall back to synthesis
        final_answer = None
        if graph_rag_result and isinstance(graph_rag_result, dict):
            final_answer = graph_rag_result.get("answer")

        if not final_answer:
            final_answer = await self._synthesize_from_results(goal, graph_rag_result, meetings_result)

        return {
            "goal": goal,
            "graph_rag_result": graph_rag_result,
            "meetings_result": meetings_result,
            "answer": final_answer,
            "scratchpad": self.scratchpad,
        }

    async def _synthesize_from_results(
        self,
        goal: str,
        graph_rag_result: Optional[Dict[str, Any]],
        meetings_result: Optional[Dict[str, Any]],
    ) -> str:
        """Synthesise a final answer from available tool outputs."""
        combined_chunks: List[Dict[str, Any]] = []
        if graph_rag_result and graph_rag_result.get("chunks"):
            combined_chunks.extend(graph_rag_result["chunks"])
        if meetings_result:
            combined_chunks.append({"file": "meetings", "text": str(meetings_result)})

        llm_tool = self._registry.get("llm_summarize")
        if llm_tool:
            out = await self._log_and_run_tool(llm_tool, question=goal, prompt=summarize_prompt, chunks=combined_chunks)
            return out.get("answer", "")
        return self._synthesize_answer(goal, combined_chunks)


    # ------------------------------------------------------------------
    # Graph RAG pipeline
    # ------------------------------------------------------------------

    async def graph_rag(
        self,
        goal: str,
        user_email: Optional[str] = None,
        max_iters: int = 4,
        min_hits: int = 6,
    ) -> Dict[str, Any]:
        """
        Iterative retrieval-augmented generation loop.

        Each iteration proposes queries, runs vector + graph search, reranks
        results with hybrid RRF, checks confidence, and – when sufficient –
        calls the LLM summarizer to produce a grounded answer.
        """
        kb = self.kb_loader.load(user_email) if user_email else {}
        self.scratchpad.append(
            f"Loaded KB keys: files={len(kb.get('files', {}))}, folders={len(kb.get('folders', {}))}"
        )

        vtool = self._registry.get("vector_search")
        gtool = self._registry.get("graph_search")
        llm = self._registry.get("llm_summarize")

        collected: List[Dict[str, Any]] = []
        iteration_metrics: List[Dict[str, Any]] = []

        for it in range(1, max_iters + 1):
            queries = self._propose_queries(goal, kb, it)
            self.scratchpad.append(f"Iter {it} queries: {queries}")

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
                if llm:
                    return await self._finalize_answer(goal, it, iteration_metrics, reranked, confidence, llm)
                answer = self._synthesize_answer(goal, reranked)
                return {
                    "goal": goal, "iterations": it, "chunks": reranked,
                    "answer": answer, "confidence": confidence, "status": "stub",
                    "scratchpad": self.scratchpad,
                }

            self.scratchpad.append("Low confidence; refining queries...")

        # Exhausted iterations – summarize whatever we collected
        final = hybrid_rerank(collected, goal, top_k=10) if collected else []
        if not final:
            final = naive_rerank(collected, goal, top_k=10)

        if llm and final:
            return await self._finalize_answer(goal, max_iters, iteration_metrics, final, None, llm)

        if llm and not final:
            llm_out = await self._log_and_run_tool(llm, question=goal, prompt=summarize_prompt, chunks=[])
            answer = (
                "The documents do not contain a specific answer to this question. "
                "Based on general knowledge, here is a broad response:\n\n" + llm_out.get("answer", "")
            )
            log_event("answer.eval", {"iterations": max_iters, "confidence": None, "evidence_score": 0.0, "status": "insufficient"})
            return {
                "goal": goal, "iterations": max_iters,
                "iteration_metrics": iteration_metrics,
                "chunks": [], "answer": answer,
                "answer_type": "generalized", "confidence": None,
                "evidence_score": 0.0, "status": "insufficient",
                "scratchpad": self.scratchpad,
            }

        answer = self._synthesize_answer(goal, final)
        return {
            "goal": goal, "iterations": max_iters,
            "iteration_metrics": iteration_metrics,
            "chunks": final, "answer": answer,
            "answer_type": "stub", "confidence": None,
            "status": "stub", "scratchpad": self.scratchpad,
        }

    async def _finalize_answer(
        self,
        goal: str,
        iterations: int,
        iteration_metrics: List[Dict[str, Any]],
        chunks: List[Dict[str, Any]],
        confidence: Optional[float],
        llm: Any,
    ) -> Dict[str, Any]:
        """Call LLM to summarize *chunks* and return a structured answer dict."""
        llm_out = await self._log_and_run_tool(llm, question=goal, prompt=summarize_prompt, chunks=chunks)
        answer = llm_out.get("answer", "")
        ev = self._evidence_score(answer, chunks)
        status = "grounded" if ev >= self.min_evidence else "insufficient"
        answer_type = "grounded" if status == "grounded" else "generalized"
        if status == "insufficient":
            answer = (
                "The documents do not contain a specific answer to this question. "
                "Based on limited evidence, here is a general response:\n\n" + (answer or "")
            )
        log_event("answer.eval", {
            "iterations": iterations,
            "confidence": confidence,
            "evidence_score": ev,
            "status": status,
        })
        return {
            "goal": goal,
            "iterations": iterations,
            "iteration_metrics": iteration_metrics,
            "chunks": chunks,
            "answer": answer,
            "answer_type": answer_type,
            "confidence": confidence,
            "evidence_score": ev,
            "status": status,
            "scratchpad": self.scratchpad,
        }

    def _synthesize_answer(self, goal: str, chunks: List[Dict[str, Any]]) -> str:
        parts = [
            f"- {c.get('file')}: {(c.get('text') or '')[:200].replace('\n', ' ')}"
            for c in chunks[:8]
        ]
        return "\n".join(
            [f"Question: {goal}", "Relevant passages:"]
            + parts
            + ["\n(Stub synthesis: replace with an LLM-generated answer.)"]
        )

    def _get_user_email(self) -> Optional[str]:
        return os.getenv(self.user_email_env)

    # ------------------------------------------------------------------
    # Calendar / meetings
    # ------------------------------------------------------------------

    async def get_meetings(self, question: str) -> Dict[str, Any]:
        """
        Extract start/end dates from *question* using the LLM and fetch
        calendar events for that window.

        Date extraction rules:
        - Month-only  → full month range (current year if no year given)
        - 1st–7th range → start extended -30 days
        - Single date → start == end
        - No date → last 7 days
        """
        llm = self._registry.get("llm_summarize")
        if not llm:
            return {"error": "llm_summarize tool not found"}

        today = datetime.utcnow().date()
        current_year = today.year
        default_end = today.isoformat()
        default_start = (today - timedelta(days=7)).isoformat()

        prompt = (
            "Extract the start and end date in ISO8601 format (YYYY-MM-DD) for the following question.\n"
            "Return ONLY a JSON object like: {\"start\": \"YYYY-MM-DD\", \"end\": \"YYYY-MM-DD\"}.\n\n"
            "RULES:\n"
            "1. If the user explicitly specifies dates → use them exactly.\n\n"
            "2. If the user mentions only a MONTH (e.g., \"March\", \"August 2024\"):\n"
            f"   - If NO YEAR is given, assume the current year: {current_year}.\n"
            "   - start = FIRST DAY of that month.\n"
            "   - end   = LAST DAY of that month.\n\n"
            "3. If the user mentions a date RANGE between the 1st and 7th of the month:\n"
            "   - start = (start_date - 30 days)\n"
            "   - end   = end_date\n\n"
            "4. If a SINGLE DATE is provided:\n"
            "   - start = that exact date\n"
            "   - end   = that exact date\n\n"
            "5. If NO dates are provided at all:\n"
            f"   - start = {default_start}\n"
            f"   - end   = {default_end}\n\n"
            f"6. Today (current date reference) is {today}.\n"
            "7. Always output valid ISO8601 dates.\n\n"
            f"Question: {question}"
        )

        import json

        resp = await llm.run(question=question, prompt=prompt, chunks=[])
        raw = resp.get("answer", "{}")

        try:
            date_info = json.loads(raw)
            start = date_info.get("start")
            end = date_info.get("end")
        except Exception:
            return {"error": "Could not parse dates from LLM response", "raw": raw}

        if not start or not end:
            return {"error": "LLM did not provide start or end date", "raw": raw}

        meetings_tool = self._registry.get("get_meetings")
        if not meetings_tool:
            return {"error": "get_meetings tool not found"}

        return await meetings_tool.run(start=start, end=end)
