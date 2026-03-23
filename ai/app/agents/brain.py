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

import json as _json

def _parse_llm_json(raw: str) -> Dict[str, Any]:
    """Parse JSON from LLM output, stripping markdown code fences if present."""
    text = raw.strip()
    # Strip ```json ... ``` or ``` ... ```
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()
    # Try to find first { ... } block
    if not text.startswith("{"):
        brace = text.find("{")
        if brace != -1:
            text = text[brace:]
    # Trim trailing junk after last }
    last_brace = text.rfind("}")
    if last_brace != -1:
        text = text[: last_brace + 1]
    return _json.loads(text)

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
        self.min_hits = int(os.getenv("MIN_HITS", "6"))
        self.min_evidence = float(os.getenv("MIN_EVIDENCE", "0.20"))

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
        Route *goal* through the orchestration pipeline and return a
        synthesised answer.

        Pipeline stages:
          1. Route  -- LLM decides which capabilities to activate
          2. Plan   -- build execution steps (with parallel groups)
          3. Execute -- run graph_rag / get_meetings (concurrently if both)
          4. Synthesize -- merge outputs into a final answer
        """
        logger.info("BrainAgent.run started  goal=%r", goal)

        goal = (goal or "").strip()
        if not goal:
            return {"goal": "", "answer": "Please provide a question or goal.", "scratchpad": []}
        if len(goal) > 5000:
            return {"goal": goal[:50] + "...", "answer": "Goal exceeds maximum length of 5000 characters.", "scratchpad": []}

        user_email = user_email or self._get_user_email()

        from app.util.log import log_brain_event

        # --- Stage 1: Route ---
        plan = await self._orchestrator.route(goal)
        log_brain_event("orchestration_plan", {"goal": goal, "plan": plan, "user_email": user_email})
        self.scratchpad.append(f"Routing plan: {plan}")

        graph_rag_result: Optional[Dict[str, Any]] = None
        meetings_result: Optional[Dict[str, Any]] = None
        create_event_result: Optional[Dict[str, Any]] = None
        create_task_result: Optional[Dict[str, Any]] = None
        create_note_result: Optional[Dict[str, Any]] = None
        edit_note_result: Optional[Dict[str, Any]] = None

        # --- Stage 2 & 3: Plan + Execute ---
        # graph_rag is handled internally (iterative loop), so we run it
        # ourselves rather than through the orchestrator's tool execution.
        # get_meetings is delegated to the orchestrator pipeline.

        import asyncio
        tasks = []

        if plan.get("graph_rag"):
            tasks.append(("graph_rag", self.graph_rag(goal, user_email, max_iters, min_hits)))

        if plan.get("get_meetings"):
            tasks.append(("get_meetings", self.get_meetings(goal, user_email)))

        if plan.get("create_event"):
            tasks.append(("create_event", self._handle_create_event(goal, user_email)))

        if plan.get("create_task"):
            tasks.append(("create_task", self._handle_create_task(goal, user_email)))

        if plan.get("create_note"):
            # If graph_rag is also active, we'll create the note from the RAG answer later
            if not plan.get("graph_rag"):
                tasks.append(("create_note", self._handle_create_note(goal, user_email)))

        if plan.get("edit_note"):
            tasks.append(("edit_note", self._handle_edit_note(goal, user_email)))

        if tasks:
            # Run active tasks concurrently
            results = await asyncio.gather(*[t[1] for t in tasks], return_exceptions=True)
            for (name, _), result in zip(tasks, results):
                if isinstance(result, Exception):
                    logger.error("Task '%s' failed: %s", name, result)
                    self.scratchpad.append(f"{name} failed: {result}")
                elif name == "graph_rag":
                    graph_rag_result = result
                    self.scratchpad.append(f"graph_rag completed: {len(result.get('chunks', []))} chunks")
                elif name == "get_meetings":
                    meetings_result = result
                    self.scratchpad.append(f"get_meetings completed")
                elif name == "create_event":
                    create_event_result = result
                    self.scratchpad.append(f"create_event completed: {result}")
                elif name == "create_task":
                    create_task_result = result
                    self.scratchpad.append(f"create_task completed: {result}")
                elif name == "create_note":
                    create_note_result = result
                    self.scratchpad.append(f"create_note completed")
                elif name == "edit_note":
                    edit_note_result = result
                    self.scratchpad.append(f"edit_note completed")

        # If graph_rag + create_note were both requested, create a note from the RAG answer
        if plan.get("create_note") and plan.get("graph_rag") and graph_rag_result:
            create_note_result = await self._handle_create_note_from_rag(
                goal, user_email, graph_rag_result
            )
            self.scratchpad.append("create_note (from RAG) completed")

        # --- Stage 4: Synthesize ---

        # If an action was performed (create event/task/note or edit note), return confirmation
        if create_event_result or create_task_result or create_note_result or edit_note_result:
            return await self._synthesize_action_result(
                goal, create_event_result, create_task_result,
                graph_rag_result, meetings_result,
                create_note_result, edit_note_result,
            )

        if (
            not plan.get("graph_rag")
            and not plan.get("get_meetings")
        ):
            # No capability selected -- direct LLM reply
            logger.info("No tool selected; using llm_summarize for a direct reply")
            llm_tool = self._registry.get("llm_summarize")
            if llm_tool:
                llm_out = await self._log_and_run_tool(llm_tool, question=goal, prompt=summarize_prompt, chunks=[])
                self.scratchpad.append("No tool selected; used llm_summarize for a direct reply.")
                return {"goal": goal, "answer": llm_out.get("answer", "").strip(), "scratchpad": self.scratchpad}
            answer = self._synthesize_answer(goal, [])
            self.scratchpad.append("No tool selected and no LLM configured; returning stub.")
            return {"goal": goal, "answer": answer, "scratchpad": self.scratchpad}

        # Prefer graph_rag answer when available
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
            formatted = self._format_meetings(meetings_result)
            combined_chunks.append({"file": "calendar", "text": formatted})

        llm_tool = self._registry.get("llm_summarize")
        if llm_tool:
            prompt = (
                summarize_prompt + "\n\n"
                "If the context contains calendar events, present them in a clear, "
                "organised format with dates, times, and any tasks. "
                "Only mention events relevant to the user's question."
            )
            out = await self._log_and_run_tool(llm_tool, question=goal, prompt=prompt, chunks=combined_chunks)
            return out.get("answer", "")
        return self._synthesize_answer(goal, combined_chunks)

    @staticmethod
    def _format_meetings(data: Any) -> str:
        """Turn raw meeting JSON into structured text the LLM can reason over."""
        if isinstance(data, dict) and data.get("error"):
            return f"Calendar error: {data['error']}"

        events = data if isinstance(data, list) else []
        if not events:
            return "No calendar events found for the requested period."

        lines: List[str] = [f"Found {len(events)} calendar event(s):\n"]
        for ev in events:
            start = ev.get("start", "")
            end = ev.get("end", "")
            title = ev.get("title", "Untitled")
            desc = ev.get("description") or ""
            all_day = ev.get("isAllDay", False)

            time_str = "All day" if all_day else f"{start} → {end}" if end else start
            line = f"• {title}  |  {time_str}"
            if desc:
                line += f"\n  {desc}"

            tasks = ev.get("tasks") or []
            for t in tasks:
                status = "✓" if t.get("completed") else "○"
                pri = t.get("priority", "MEDIUM")
                line += f"\n  {status} [{pri}] {t.get('title', 'Untitled task')}"
                if t.get("dueDate"):
                    line += f" (due {t['dueDate']})"

            lines.append(line)

        return "\n".join(lines)


    # ------------------------------------------------------------------
    # Graph RAG – search → rerank → synthesize
    # ------------------------------------------------------------------

    async def graph_rag(
        self,
        goal: str,
        user_email: Optional[str] = None,
        max_iters: int = 4,
        min_hits: int = 6,
    ) -> Dict[str, Any]:
        """Iterative retrieval loop with LLM-driven query fallback.

        Iteration strategy:
          1. Search with the user's original question
          2. If 0 results: ask LLM to rewrite query with keywords
          3. If still low confidence: extract key terms and retry
          4. Final attempt with broader keyword query
        """
        from app.util.log import log_brain_event

        self.kb_loader.load(user_email) if user_email else None

        vtool = self._registry.get("vector_search")
        gtool = self._registry.get("graph_search")
        egtool = self._registry.get("entity_graph_search")
        llm = self._registry.get("llm_summarize")

        collected: List[Dict[str, Any]] = []
        top: List[Dict[str, Any]] = []
        confidence = 0.0
        errors: List[str] = []

        for it in range(1, max_iters + 1):
            # --- Build query for this iteration ---
            if it == 1:
                query = goal
            elif it == 2 and not collected and llm:
                # 0 results on iter 1 → ask LLM for a better search query
                query = await self._llm_rewrite_query(llm, goal)
            elif it == 3 and not collected:
                # Still 0 → extract just the key nouns
                query = " ".join(
                    w for w in re.findall(r"[A-Za-z][a-z]{2,}", goal)
                    if w.lower() not in {"what", "which", "where", "when", "that", "this",
                                          "from", "with", "about", "does", "have", "been",
                                          "their", "there", "these", "those", "between"}
                ) or goal
            else:
                # Broader keyword variant
                query = " ".join(
                    w for w in re.findall(r"\w+", goal) if len(w) > 3
                ) or goal

            log_brain_event("iteration.start", {
                "iter": it, "query": query[:200], "collected_so_far": len(collected),
            })

            # --- Run all search tools ---
            iter_added = 0
            for tool, name, k in [
                (vtool, "vector", 25),
                (gtool, "graph", 15),
                (egtool, "entity_graph", 15),
            ]:
                if not tool:
                    continue
                out = await self._log_and_run_tool(tool, query=query, top_k=k)
                # Capture errors from tools
                if out.get("error"):
                    errors.append(f"{name}: {out['error']}")
                items = out.get("items", [])
                for i, item in enumerate(items):
                    item = dict(item)
                    item.setdefault("source", name)
                    item.setdefault("initial_rank", i)
                    collected.append(item)
                    iter_added += 1

            # --- Rerank ---
            top = hybrid_rerank(collected, goal, top_k=20) or naive_rerank(
                collected, goal, top_k=20
            )

            scores = [
                c.get("rerank_score", c.get("score", 0))
                for c in top[:5]
                if isinstance(c.get("rerank_score", c.get("score")), (int, float))
            ]
            confidence = sum(scores) / max(1, len(scores)) if scores else 0.0

            # --- Log iteration metrics ---
            metric = {
                "iter": it, "query": query[:200],
                "added": iter_added, "total": len(collected),
                "top": len(top), "confidence": round(confidence, 4),
                "top_files": [c.get("file") for c in top[:5]],
                "top_scores": [round(s, 4) for s in scores],
                "errors": errors[-3:] if errors else [],
            }
            log_event("iteration.eval", metric)
            log_brain_event("iteration.eval", metric)
            self.scratchpad.append(
                f"Iter {it}: query={query[:80]!r} → {iter_added} new, "
                f"{len(collected)} total, top={len(top)}, conf={confidence:.3f}"
            )

            # --- Check if we have enough ---
            if len(top) >= (min_hits or self.min_hits) and confidence >= self.conf_summarize:
                break

        # --- Handle errors: if all tools errored out, surface it ---
        if not collected and errors:
            error_msg = (
                "All search tools failed. This usually means the database is "
                "unreachable.\n\nErrors:\n" + "\n".join(f"- {e}" for e in errors[:5])
            )
            log_event("graph_rag.error", {"errors": errors, "goal": goal[:200]})
            return {
                "goal": goal, "answer": error_msg,
                "chunks": [], "confidence": 0, "status": "error",
                "scratchpad": self.scratchpad,
            }

        if not top:
            log_event("graph_rag.empty", {"goal": goal[:200], "iterations": it})
            return {
                "goal": goal, "answer": "No relevant documents found for this query.",
                "chunks": [], "confidence": 0, "status": "insufficient",
                "scratchpad": self.scratchpad,
            }

        if llm:
            return await self._finalize_answer(goal, it, top, confidence, llm)

        return {
            "goal": goal, "answer": self._synthesize_answer(goal, top),
            "chunks": top, "confidence": confidence, "status": "stub",
            "scratchpad": self.scratchpad,
        }

    # ------------------------------------------------------------------
    # LLM query rewrite (called when retrieval returns 0 results)
    # ------------------------------------------------------------------

    async def _llm_rewrite_query(self, llm: Any, goal: str) -> str:
        """Ask the LLM to rewrite the user's question as a keyword search query."""
        prompt = (
            "Rewrite this question as a short keyword search query (max 15 words) "
            "that would match relevant paragraphs in academic PDF documents. "
            "Use specific technical terms. Return ONLY the query string, no quotes.\n\n"
            f"Question: {goal}\n\nSearch query:"
        )
        try:
            resp = await llm.run(question=goal, prompt=prompt, chunks=[])
            rewritten = (resp.get("answer") or "").strip().strip('"').strip("'")
            if rewritten and len(rewritten) > 5:
                log_event("query.rewrite", {"original": goal[:120], "rewritten": rewritten[:120]})
                self.scratchpad.append(f"LLM rewrote query: {rewritten!r}")
                return rewritten
        except Exception as exc:
            logger.warning("Query rewrite failed: %s", exc)
        return goal

    async def _finalize_answer(
        self,
        goal: str,
        iterations: int,
        chunks: List[Dict[str, Any]],
        confidence: Optional[float],
        llm: Any,
    ) -> Dict[str, Any]:
        """LLM synthesis with evidence scoring and source extraction."""
        llm_out = await self._log_and_run_tool(llm, question=goal, prompt=summarize_prompt, chunks=chunks)
        answer = llm_out.get("answer", "")
        ev = self._evidence_score(answer, chunks)
        status = "grounded" if ev >= self.min_evidence else "insufficient"
        if status == "insufficient":
            answer = (
                "The documents do not contain enough information to answer precisely.\n\n"
                + (answer or "")
            )

        seen: set = set()
        sources: List[Dict[str, Any]] = []
        for c in chunks[:12]:
            key = (c.get("file") or "unknown", c.get("page") or 0)
            if key not in seen:
                seen.add(key)
                sources.append({
                    "file": key[0],
                    "page": key[1] or None,
                    "preview": (c.get("text") or "")[:120].replace("\n", " "),
                })

        log_event("answer.eval", {
            "iterations": iterations, "confidence": confidence,
            "evidence_score": ev, "status": status,
        })
        return {
            "goal": goal, "iterations": iterations, "chunks": chunks,
            "answer": answer, "confidence": confidence,
            "evidence_score": ev, "status": status,
            "sources": sources, "scratchpad": self.scratchpad,
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

    async def get_meetings(self, question: str, user_email: Optional[str] = None) -> Dict[str, Any]:
        """
        Extract start/end dates from *question* using the LLM and fetch
        calendar events for that window, scoped to the given user.

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
        except json.JSONDecodeError as e:
            logger.error("Failed to parse LLM date response: %s, raw=%r", e, raw[:200])
            return {"error": "Could not parse dates from LLM response", "raw": raw}
        except Exception as e:
            logger.exception("Unexpected error parsing date response")
            return {"error": f"Date parsing failed: {e}", "raw": raw}

        if not start or not end:
            return {"error": "LLM did not provide start or end date", "raw": raw}

        meetings_tool = self._registry.get("get_meetings")
        if not meetings_tool:
            return {"error": "get_meetings tool not found"}

        return await meetings_tool.run(start=start, end=end, user_email=user_email)

    # ------------------------------------------------------------------
    # Create event / task helpers
    # ------------------------------------------------------------------

    async def _handle_create_event(
        self, goal: str, user_email: Optional[str]
    ) -> Dict[str, Any]:
        """Use the LLM to extract event details from the user's goal, then
        call CreateEventTool to persist it."""
        llm = self._registry.get("llm_summarize")
        if not llm:
            return {"error": "llm_summarize tool not found"}

        today = datetime.utcnow().date()
        tomorrow = today + timedelta(days=1)
        prompt = (
            "Extract calendar event details from the user's message.\n"
            "Return ONLY a JSON object with these fields:\n"
            '{\n'
            '  "title": "string (required)",\n'
            '  "start": "YYYY-MM-DDTHH:MM:SS (required, ISO8601)",\n'
            '  "end": "YYYY-MM-DDTHH:MM:SS (optional)",\n'
            '  "description": "string (optional)",\n'
            '  "is_all_day": false,\n'
            '  "tasks": [{"title": "string", "priority": "LOW|MEDIUM|HIGH"}]\n'
            '}\n\n'
            "RULES:\n"
            f"- Today is {today} (a {today.strftime('%A')}). Tomorrow is {tomorrow}.\n"
            "- 'tmrw', 'tomorrow' → use tomorrow's date.\n"
            "- Always resolve relative dates to concrete YYYY-MM-DD dates.\n"
            "- start and end MUST be in YYYY-MM-DDTHH:MM:SS format. NEVER use words.\n"
            "- If no time is specified, default to 09:00.\n"
            "- If the user mentions sub-tasks or action items, include them in tasks[].\n"
            "- Return ONLY valid JSON. No extra text.\n\n"
            f"User message: {goal}"
        )

        resp = await llm.run(question=goal, prompt=prompt, chunks=[])
        raw = resp.get("answer", "{}")

        try:
            details = _parse_llm_json(raw)
        except (ValueError, _json.JSONDecodeError):
            logger.error("Failed to parse create_event LLM response: %r", raw[:300])
            return {"error": "Could not parse event details", "raw": raw}

        tool = self._registry.get("create_event")
        if not tool:
            return {"error": "create_event tool not registered"}

        # Validate start date from LLM — fallback to today 09:00
        start_str = details.get("start", f"{today}T09:00:00")
        try:
            datetime.fromisoformat(start_str)
        except (ValueError, TypeError):
            logger.warning("LLM returned invalid start %r, falling back", start_str)
            start_str = f"{today}T09:00:00"

        end_str = details.get("end")
        if end_str:
            try:
                datetime.fromisoformat(end_str)
            except (ValueError, TypeError):
                end_str = None

        return await tool.run(
            user_email=user_email or "",
            title=details.get("title", "Untitled Event"),
            start=start_str,
            end=end_str,
            description=details.get("description"),
            is_all_day=details.get("is_all_day", False),
            tasks=details.get("tasks"),
        )

    async def _handle_create_task(
        self, goal: str, user_email: Optional[str]
    ) -> Dict[str, Any]:
        """Use the LLM to extract task details from the user's goal, then
        call CreateTaskTool.  If no event_id is provided, create a new event
        first to host the task."""
        llm = self._registry.get("llm_summarize")
        if not llm:
            return {"error": "llm_summarize tool not found"}

        today = datetime.utcnow().date()
        tomorrow = today + timedelta(days=1)
        prompt = (
            "Extract task details from the user's message.\n"
            "Return ONLY a JSON object:\n"
            '{\n'
            '  "title": "string (required)",\n'
            '  "description": "string (optional)",\n'
            '  "due_date": "YYYY-MM-DD (required — always resolve to a concrete date)",\n'
            '  "due_time": "HH:MM (optional, 24-hour format)",\n'
            '  "priority": "LOW|MEDIUM|HIGH"\n'
            '}\n\n'
            "RULES:\n"
            f"- Today is {today} (a {today.strftime('%A')}).\n"
            f"- Tomorrow is {tomorrow}.\n"
            "- 'tmrw', 'tomorrow' → use tomorrow's date.\n"
            "- 'next Monday' → calculate the actual date.\n"
            "- If no date mentioned, default to tomorrow.\n"
            "- due_date MUST be in YYYY-MM-DD format. NEVER use words like 'tomorrow'.\n"
            "- Return ONLY valid JSON. No extra text.\n\n"
            f"User message: {goal}"
        )

        resp = await llm.run(question=goal, prompt=prompt, chunks=[])
        raw = resp.get("answer", "{}")

        try:
            details = _parse_llm_json(raw)
        except (ValueError, _json.JSONDecodeError):
            logger.error("Failed to parse create_task LLM response: %r", raw[:300])
            return {"error": "Could not parse task details", "raw": raw}

        # Create a host event for the task (tasks require an event)
        create_event_tool = self._registry.get("create_event")
        if not create_event_tool:
            return {"error": "create_event tool not registered"}

        due_date = details.get("due_date") or str(tomorrow)
        due_time = details.get("due_time") or "09:00"
        # Validate due_date is actually a date, not a word
        try:
            datetime.strptime(due_date, "%Y-%m-%d")
        except ValueError:
            logger.warning("LLM returned non-date due_date %r, falling back to tomorrow", due_date)
            due_date = str(tomorrow)
        # Normalise time — drop trailing :SS if already present
        if due_time.count(":") >= 2:
            due_time = ":".join(due_time.split(":")[:2])

        event_result = await create_event_tool.run(
            user_email=user_email or "",
            title=f"Task: {details.get('title', 'Untitled')}",
            start=f"{due_date}T{due_time}:00",
            description="Auto-created event to host a task.",
        )

        event_id = (event_result.get("event") or {}).get("id")
        if not event_id:
            return {"error": "Failed to create host event for task", "detail": event_result}

        tool = self._registry.get("create_task")
        if not tool:
            return {"error": "create_task tool not registered"}

        return await tool.run(
            user_email=user_email or "",
            event_id=event_id,
            title=details.get("title", "Untitled Task"),
            description=details.get("description"),
            due_date=details.get("due_date"),
            due_time=details.get("due_time"),
            priority=details.get("priority", "MEDIUM"),
        )

    # ------------------------------------------------------------------
    # Notes helpers
    # ------------------------------------------------------------------

    async def _handle_create_note(
        self, goal: str, user_email: Optional[str]
    ) -> Dict[str, Any]:
        """Use the LLM to extract note details, then call CreateNoteTool."""
        llm = self._registry.get("llm_summarize")
        if not llm:
            return {"error": "llm_summarize tool not found"}

        prompt = (
            "Create a detailed, well-structured note from the user's message.\n"
            "Return ONLY a JSON object:\n"
            '{\n'
            '  "title": "short descriptive title (required, under 60 chars)",\n'
            '  "content": "the full note content in markdown (required)"\n'
            '}\n\n'
            "RULES:\n"
            "- Write DETAILED, comprehensive content. Use headings, bullet points, numbered lists.\n"
            "- If the user mentions topics, agenda items, or discussion points, expand each one\n"
            "  into a full section with sub-bullets explaining the key points.\n"
            "- For meeting notes: include sections like Agenda, Discussion Points, Key Takeaways,\n"
            "  Action Items, and Next Steps where appropriate.\n"
            "- Use proper markdown: ## for headings, - for bullets, **bold** for emphasis.\n"
            "- Aim for at least 200-400 words of meaningful content.\n"
            "- Do NOT write a single line or a few bullets — be thorough and detailed.\n"
            "- Return ONLY valid JSON. No extra text.\n\n"
            f"User message: {goal}"
        )

        resp = await llm.run(question=goal, prompt=prompt, chunks=[])
        raw = resp.get("answer", "{}")

        try:
            details = _parse_llm_json(raw)
        except (ValueError, _json.JSONDecodeError):
            logger.error("Failed to parse create_note LLM response: %r", raw[:300])
            return {"error": "Could not parse note details", "raw": raw}

        tool = self._registry.get("create_note")
        if not tool:
            return {"error": "create_note tool not registered"}

        return await tool.run(
            user_email=user_email or "",
            title=details.get("title", "Untitled Note"),
            content=details.get("content", ""),
        )

    async def _handle_create_note_from_rag(
        self, goal: str, user_email: Optional[str], rag_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a note from a RAG answer — used when user says
        'make a note from this document' or 'summarize into a note'."""
        llm = self._registry.get("llm_summarize")
        if not llm:
            return {"error": "llm_summarize tool not found"}

        rag_answer = rag_result.get("answer", "")
        sources = rag_result.get("sources", [])
        source_text = ", ".join(s.get("file", "?") for s in sources[:5]) if sources else "documents"

        prompt = (
            "The user wants a note created from document content.\n"
            "Below is the RAG answer and sources. Turn it into a clean, well-structured note.\n"
            "Return ONLY a JSON object:\n"
            '{\n'
            '  "title": "short descriptive title for the note",\n'
            '  "content": "the note content in markdown"\n'
            '}\n\n'
            f"Sources: {source_text}\n\n"
            f"RAG Answer:\n{rag_answer[:3000]}\n\n"
            f"User's original request: {goal}\n\n"
            "Return ONLY valid JSON."
        )

        resp = await llm.run(question=goal, prompt=prompt, chunks=[])
        raw = resp.get("answer", "{}")

        try:
            details = _parse_llm_json(raw)
        except (ValueError, _json.JSONDecodeError):
            # Fallback: use the RAG answer directly
            details = {"title": goal[:60], "content": rag_answer}

        tool = self._registry.get("create_note")
        if not tool:
            return {"error": "create_note tool not registered"}

        return await tool.run(
            user_email=user_email or "",
            title=details.get("title", "Document Note"),
            content=details.get("content", rag_answer),
        )

    async def _handle_edit_note(
        self, goal: str, user_email: Optional[str]
    ) -> Dict[str, Any]:
        """Find which note the user wants to edit, then apply edits via LLM."""
        llm = self._registry.get("llm_summarize")
        if not llm:
            return {"error": "llm_summarize tool not found"}

        edit_tool = self._registry.get("edit_note")
        if not edit_tool:
            return {"error": "edit_note tool not registered"}

        # Step 1: List existing notes
        notes_resp = await edit_tool.list_notes(user_email or "")
        if notes_resp.get("error"):
            return notes_resp

        notes_list = notes_resp.get("notes", [])
        if not notes_list:
            return {"error": "You have no notes to edit. Create one first."}

        notes_summary = "\n".join(
            f'- id: "{n["id"]}", title: "{n["title"]}"'
            for n in notes_list[:20]
        )

        # Step 2: Ask LLM which note to edit and what changes
        prompt = (
            "The user wants to edit a note. Here are their existing notes:\n"
            f"{notes_summary}\n\n"
            "Based on the user's message, determine:\n"
            "1. Which note to edit (by id)\n"
            "2. What the FULL updated content should be\n\n"
            "Return ONLY a JSON object:\n"
            '{\n'
            '  "note_id": "the id of the note to edit",\n'
            '  "title": "new title (or null to keep current)",\n'
            '  "content": "the FULL updated note content in markdown"\n'
            '}\n\n'
            "IMPORTANT CONTENT RULES:\n"
            "- Write DETAILED, comprehensive content. Use headings, bullet points, numbered lists.\n"
            "- If the user mentions topics, agenda items, or discussion points, expand each one\n"
            "  into a full section with sub-bullets explaining the key points.\n"
            "- For meeting notes: include sections like Agenda, Discussion Points, Key Takeaways,\n"
            "  Action Items, and Next Steps where appropriate.\n"
            "- Use proper markdown: ## for headings, - for bullets, **bold** for emphasis.\n"
            "- Aim for at least 200-400 words of meaningful content.\n"
            "- Do NOT write a single line or a brief summary — be thorough and detailed.\n"
            "- If the user's message doesn't match any note, pick the closest one.\n"
            "- Return ONLY valid JSON. No extra text.\n\n"
            f"User message: {goal}"
        )

        resp = await llm.run(question=goal, prompt=prompt, chunks=[])
        raw = resp.get("answer", "{}")

        try:
            details = _parse_llm_json(raw)
        except (ValueError, _json.JSONDecodeError):
            logger.error("Failed to parse edit_note LLM response: %r", raw[:300])
            return {"error": "Could not parse edit instructions", "raw": raw}

        note_id = details.get("note_id")
        if not note_id:
            return {"error": "Could not determine which note to edit"}

        kwargs: Dict[str, Any] = {
            "user_email": user_email or "",
            "note_id": note_id,
        }
        if details.get("title") is not None:
            kwargs["title"] = details["title"]
        if details.get("content") is not None:
            kwargs["content"] = details["content"]

        return await edit_tool.run(**kwargs)

    async def _synthesize_action_result(
        self,
        goal: str,
        create_event_result: Optional[Dict[str, Any]],
        create_task_result: Optional[Dict[str, Any]],
        graph_rag_result: Optional[Dict[str, Any]],
        meetings_result: Optional[Dict[str, Any]],
        create_note_result: Optional[Dict[str, Any]] = None,
        edit_note_result: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Build a user-friendly confirmation from action results."""
        parts: List[str] = []

        if create_event_result:
            if create_event_result.get("ok"):
                ev = create_event_result.get("event", {})
                parts.append(
                    f"**Event created:** {ev.get('title', 'Untitled')}\n"
                    f"- Start: {ev.get('start', 'N/A')}\n"
                    f"- End: {ev.get('end', 'N/A')}"
                )
                ev_tasks = ev.get("tasks", [])
                if ev_tasks:
                    for t in ev_tasks:
                        parts.append(f"  - Task: {t.get('title')} ({t.get('priority', 'MEDIUM')})")
            else:
                parts.append(f"Failed to create event: {create_event_result.get('error', 'unknown')}")

        if create_task_result:
            if create_task_result.get("ok"):
                tk = create_task_result.get("task", {})
                parts.append(
                    f"**Task created:** {tk.get('title', 'Untitled')}\n"
                    f"- Priority: {tk.get('priority', 'MEDIUM')}\n"
                    f"- Due: {tk.get('dueDate', 'N/A')}"
                )
            else:
                parts.append(f"Failed to create task: {create_task_result.get('error', 'unknown')}")

        if create_note_result:
            if create_note_result.get("ok"):
                n = create_note_result.get("note", {})
                preview = (n.get("content") or "")[:150]
                parts.append(
                    f"**Note created:** {n.get('title', 'Untitled')}\n"
                    + (f"- Preview: {preview}..." if preview else "")
                )
            else:
                parts.append(f"Failed to create note: {create_note_result.get('error', 'unknown')}")

        if edit_note_result:
            if edit_note_result.get("ok"):
                n = edit_note_result.get("note", {})
                parts.append(f"**Note updated:** {n.get('title', 'Untitled')}")
            else:
                parts.append(f"Failed to edit note: {edit_note_result.get('error', 'unknown')}")

        # If graph_rag also ran, append that answer too
        if graph_rag_result and graph_rag_result.get("answer"):
            parts.append(f"\n---\n{graph_rag_result['answer']}")

        answer = "\n\n".join(parts) if parts else "Action completed."
        return {
            "goal": goal,
            "answer": answer,
            "action_results": {
                "create_event": create_event_result,
                "create_task": create_task_result,
                "create_note": create_note_result,
                "edit_note": edit_note_result,
            },
            "scratchpad": self.scratchpad,
        }
