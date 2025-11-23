from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol
import os
import re
from app.util.prompts import summarize_prompt
from .knowledge import KnowledgeLoader
from .rerank import naive_rerank, hybrid_rerank
from app.util.log import log_event
from datetime import datetime, timedelta


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
        # Remove chunk text from logs for privacy and log cleanliness
        log_args = dict(kwargs)
        if 'chunks' in log_args:
            # Redact chunk text, keep only file names and count
            log_args['chunks'] = [
                {'file': c.get('file'), 'source': c.get('source', ''), 'score': c.get('score', None)}
                for c in log_args['chunks']
            ]
            log_args['chunk_count'] = len(kwargs['chunks'])
        log_event("tool.invoke", {
            "tool": getattr(tool, 'name', str(tool)),
            "description": getattr(tool, 'description', ''),
            "args": log_args
        })
        return await tool.run(**kwargs)

    async def run(self, goal: str, user_email: Optional[str] = None, max_iters: int = 4, min_hits: int = 6) -> Dict[str, Any]:
        """
        Orchestrates tool invocation based on the LLM router plan.
        All tool executions (graph_rag, get_meetings, etc.) are logged as events within their respective methods.
        This function only coordinates the plan and returns results.
        Also logs the orchestration plan as a brain_event (once per run).
        """
        print("enetred brain agent run method")
        user_email = user_email or self._get_user_email()
        from app.util.prompts import RouterPrompt
        from app.util.log import log_brain_event
        llm_router = self.tools.get("llm_router")
        if not llm_router:
            return {"error": "llm_router tool not found"}
        # Call router to get plan
        router_resp = await llm_router.run(question=goal )
        import json
        try:
            plan = json.loads(router_resp.get("answer", "{}"))
        except Exception:
            return {"error": "Router did not return valid JSON", "raw": router_resp.get("answer")}
        # Log the orchestration plan ONCE per run
        log_brain_event("orchestration_plan", {"goal": goal, "plan": plan, "user_email": user_email})
        graph_rag_result = None
        meetings_result = None
        if plan.get("graph_rag"):
            graph_rag_result = await self.graph_rag(goal, user_email, max_iters, min_hits)
            self.scratchpad.append(f"graph_rag result: {graph_rag_result}")
        if plan.get("get_meetings"):
            meetings_result = await self.get_meetings(goal)
            self.scratchpad.append(f"get_meetings result: {meetings_result}")
        # If router picked no tools, ask LLM for a direct reply
        if not plan.get("graph_rag") and not plan.get("get_meetings"):
            print("no tool selected calling llm_summarize")
            llm_tool = self.tools.get("llm_summarize")
            if llm_tool:
                # Use summarizer LLM to generate a natural reply (no context)
                llm_out = await self._log_and_run_tool(llm_tool, question=goal, prompt=summarize_prompt, chunks=[])
                answer = llm_out.get("answer", "").strip()
                self.scratchpad.append("No tool selected; used llm_summarize for a direct reply.")
                return {"goal": goal, "answer": answer, "scratchpad": self.scratchpad}
            # fallback to stub synth if no LLM configured
            answer = self._synthesize_answer(goal, [])
            self.scratchpad.append("No tool selected and no LLM configured; returning stub.")
            return {"goal": goal, "answer": answer, "scratchpad": self.scratchpad}

        # If at least one tool ran, prefer their outputs for the final answer
        final_answer = None
        if graph_rag_result and isinstance(graph_rag_result, dict):
            final_answer = graph_rag_result.get("answer")
        elif meetings_result and isinstance(meetings_result, dict):
            # optionally call LLM to summarize meetings_result if you want a textual reply
            final_answer = None  # we'll try to synthesize below

        if not final_answer:
            # If LLM summarize tool exists, ask it to synthesize both sources
            llm_tool = self.tools.get("llm_summarize")
            combined_chunks = []
            if graph_rag_result and graph_rag_result.get("chunks"):
                combined_chunks.extend(graph_rag_result.get("chunks", []))
            # meetings_result may be structured; include a short representation as a chunk
            if meetings_result:
                combined_chunks.append({"file": "meetings", "text": str(meetings_result)})
            if llm_tool:
                llm_out = await self._log_and_run_tool(llm_tool, question=goal, prompt=summarize_prompt, chunks=combined_chunks)
                final_answer = llm_out.get("answer", "")
            else:
                final_answer = self._synthesize_answer(goal, combined_chunks)

        return {
            "goal": goal,
            "graph_rag_result": graph_rag_result,
            "meetings_result": meetings_result,
            "answer": final_answer,
            "scratchpad": self.scratchpad,
        }


    async def graph_rag(self, goal: str, user_email: Optional[str] = None, max_iters: int = 4, min_hits: int = 6) -> Dict[str, Any]:
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
                    llm_out = await self._log_and_run_tool(llm, question=goal, prompt=summarize_prompt, chunks=reranked)
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
                        "status": status
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
            # pass the summarization prompt so LLMTool.run gets required args
            llm_out = await self._log_and_run_tool(llm, question=goal, prompt=summarize_prompt, chunks=final)
            answer = llm_out.get("answer", "")

            ev = self._evidence_score(answer, final)
            status = "grounded" if ev >= self.min_evidence else "insufficient"
            answer_type = "grounded" if status == "grounded" else "generalized"
            if status == "insufficient":
                answer = (
                    "The documents do not contain a specific answer to this question. "
                    "Based on limited evidence, here is a general response:\n\n" + (answer or "")
                )
            log_event("answer.eval", {"iterations": max_iters, "confidence": None, "evidence_score": ev, "status": status})
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
            llm_out = await self._log_and_run_tool(llm, question=goal, prompt=summarize_prompt, chunks=[])
            answer = llm_out.get("answer", "")
            # Force explicit disclaimer when no evidence
            answer = (
                "The documents do not contain a specific answer to this question. "
                "Based on general knowledge, here is a broad response:\n\n" + (answer or "")
            )
            log_event("answer.eval", {"iterations": max_iters, "confidence": None, "evidence_score": 0.0, "status": "insufficient"})
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

    async def get_meetings(self, question: str) -> Dict[str, Any]:
        """
        Extracts start/end dates using llm_summarize and calls the get_meetings tool.
        Enhanced date rules:
        - If month only → use TODAY's year → first & last day of that month.
        - If range is 1st–7th → start = start-30days, end = given end.
        - If single date → start=end=that date.
        - If no date → default start = today-7days, end = today.
        """

        llm = self.tools.get("llm_summarize")
        if not llm:
            return {"error": "llm_summarize tool not found"}

        # Current date refs
        today = datetime.utcnow().date()
        current_year = today.year

        # Default fallback window (end = today, start = 7 days before)
        default_end = today.isoformat()
        default_start = (today - timedelta(days=7)).isoformat()

        # The improved routing + extraction prompt
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
            f"7. Always output valid ISO8601 dates.\n\n"

            f"Question: {question}"
        )

        # Call LLM
        resp = await llm.run(question=question, prompt=prompt, chunks=[])

        import json
        raw = resp.get("answer", "{}")

        # Parse JSON
        try:
            date_info = json.loads(raw)
            start = date_info.get("start")
            end = date_info.get("end")
        except Exception:
            return {
                "error": "Could not parse dates from LLM response",
                "raw": raw
            }

        # Validate
        if not start or not end:
            return {
                "error": "LLM did not provide start or end date",
                "raw": raw
            }

        meetings_tool = self.tools.get("get_meetings")
        if not meetings_tool:
            return {"error": "get_meetings tool not found"}

        return await meetings_tool.run(start=start, end=end)
