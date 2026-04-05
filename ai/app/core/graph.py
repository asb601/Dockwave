"""Agentic LangGraph orchestration with LLM brain loop.

The LLM brain dynamically decides what tools to call at each step —
like a human: understand the question → search documents → read results →
take actions → respond.  No static boolean routing or hardcoded pipelines.

Graph:  init → brain ←→ tools (loop) → finalize → END
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from operator import add
from typing import Annotated, Any, Dict, List

from langgraph.graph import END, StateGraph
from langsmith import traceable
from typing_extensions import TypedDict

from app.agents.rerank import cohere_rerank, hybrid_rerank, naive_rerank
from app.core.llm_config import build_llm_chain
from app.core.tool_registry import ToolRegistry
from app.services.memory import append_message, get_history
from app.util.log import log_brain_event, log_event, log_llm_cost

logger = logging.getLogger("intellidoc.graph")

# ── State ──────────────────────────────────────────────────────────────────

class AgentState(TypedDict, total=False):
    """State that flows through the agentic loop."""
    # Input
    goal: str
    user_email: str
    session_id: str
    history: List[Dict[str, str]]
    # Brain conversation (OpenAI messages format)
    messages: Annotated[List[Dict[str, Any]], add]
    # Pending tool calls from the brain
    pending_calls: List[Dict[str, Any]]
    # Accumulated search chunks (for evidence scoring / sources)
    all_chunks: Annotated[List[Dict[str, Any]], add]
    # Output
    answer: str
    sources: List[Dict[str, Any]]
    evidence_score: float
    status: str
    action_results: Dict[str, Any]
    # Control
    step: int
    max_steps: int
    # Debug
    scratchpad: Annotated[List[str], add]
    errors: Annotated[List[str], add]


# ── Tool schemas for the brain ─────────────────────────────────────────────

_BRAIN_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_documents",
            "description": (
                "Search the user's uploaded documents, files, PDFs, and research papers. "
                "Returns relevant passages with source references. "
                "Use this whenever you need information from the user's documents."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Specific search query. Be descriptive about what to look for.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_meeting",
            "description": "Create a new calendar event, meeting, or appointment.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Event title"},
                    "start": {
                        "type": "string",
                        "description": "Start datetime in ISO format YYYY-MM-DDTHH:MM:SS",
                    },
                    "end": {
                        "type": "string",
                        "description": "End datetime in ISO format (optional, defaults to 1 hour after start)",
                    },
                    "description": {"type": "string", "description": "Event description (optional)"},
                },
                "required": ["title", "start"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Create a new task, todo, or reminder.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Task title"},
                    "description": {"type": "string", "description": "Task description (optional)"},
                    "due_date": {
                        "type": "string",
                        "description": "Due date in YYYY-MM-DD format",
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["LOW", "MEDIUM", "HIGH"],
                        "description": "Task priority (default: MEDIUM)",
                    },
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_note",
            "description": (
                "Create a new note or memo. You write the full content yourself — "
                "use markdown formatting with headings, bullets, and details. "
                "If summarizing documents, FIRST call search_documents to get the actual content, "
                "then call create_note with a detailed summary based on those results."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short descriptive title (under 60 chars)"},
                    "content": {
                        "type": "string",
                        "description": "Full note content in markdown. Be detailed — use headings, bullet points, specific facts and figures.",
                    },
                },
                "required": ["title", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_note",
            "description": "Edit an existing note. Call list_notes first to find the note ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {"type": "string", "description": "The ID of the note to edit"},
                    "title": {"type": "string", "description": "New title (optional)"},
                    "content": {"type": "string", "description": "New content in markdown"},
                },
                "required": ["note_id", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_notes",
            "description": "List the user's existing notes. Use before edit_note to find note IDs.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_calendar",
            "description": "View the user's calendar events for a date range.",
            "parameters": {
                "type": "object",
                "properties": {
                    "start": {"type": "string", "description": "Start date in YYYY-MM-DD format"},
                    "end": {"type": "string", "description": "End date in YYYY-MM-DD format"},
                },
                "required": ["start", "end"],
            },
        },
    },
]


# ── Helpers ────────────────────────────────────────────────────────────────

def _evidence_score(answer: str, chunks: List[Dict[str, Any]]) -> float:
    src = " \n ".join((c.get("text") or "") for c in chunks[:10]).lower()
    toks = [t for t in re.findall(r"[a-zA-Z0-9_]+", (answer or "").lower()) if len(t) > 3]
    if not toks:
        return 0.0
    distinct = list(dict.fromkeys(toks))
    hits = sum(1 for t in distinct if t in src)
    return hits / max(1, len(distinct))


def _hallucination_score(answer: str, chunks: List[Dict[str, Any]]) -> float:
    src = " ".join((c.get("text") or "") for c in chunks[:15]).lower()
    numbers = re.findall(r"\b\d+(?:\.\d+)?%?\b", answer)
    entities = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", answer)
    claims = numbers + [e.lower() for e in entities]
    if not claims:
        return 0.0
    unsupported = sum(1 for c in claims if c.lower() not in src)
    return unsupported / len(claims)


def _build_system_prompt() -> str:
    today = datetime.now(timezone.utc).date()
    tomorrow = today + timedelta(days=1)
    return (
        "You are IntelliDoc — a knowledgeable, friendly AI mentor.\n"
        "You can talk about anything: explain concepts, help with ideas, answer general knowledge "
        "questions, have casual conversations, give advice, brainstorm, and more.\n"
        "You also have access to powerful tools for the user's workspace: document search, "
        "notes, tasks, and calendar.\n\n"
        f"Today is {today.isoformat()} ({today.strftime('%A')}). Tomorrow is {tomorrow.isoformat()}.\n\n"
        "WHEN TO USE TOOLS:\n"
        "- If the user asks about their documents, papers, or uploaded files → call search_documents first.\n"
        "- If they want to create/edit notes, schedule meetings, or manage tasks → use the appropriate tool.\n"
        "- If it's a general question, casual chat, or something you already know → just answer directly. "
        "No need to search.\n\n"
        "APPROACH:\n"
        "- Think step by step. Only call tools when they'd genuinely help.\n"
        "- You can call MULTIPLE tools in sequence — search, then create, then respond.\n"
        "- For meetings/events: resolve relative dates ('tomorrow', 'next Monday') to ISO format.\n"
        "- When creating notes that reference documents: call search_documents FIRST to get real content, "
        "then call create_note with detailed content from those results.\n\n"
        "GROUNDING — THIS IS CRITICAL:\n"
        "You are both a mentor AND a document assistant. The rules are different depending on source:\n\n"
        "  For DOCUMENT FACTS (numbers, names, dates, values from search results):\n"
        "  - Quote them EXACTLY as they appear in the search results. Never change a number, name, or value.\n"
        "  - If a passage says 'l=9', you say 'l=9'. Never approximate, round, or reword specific data.\n"
        "  - Cite as [chunk_number, page] so the user can verify.\n"
        "  - If the search results don't contain what you need, say 'this wasn't found in your documents' "
        "— never fill the gap by guessing what the document might say.\n\n"
        "  For REASONING, EXPLANATION, and GENERAL KNOWLEDGE:\n"
        "  - Be smart. Connect ideas across documents. Explain concepts in your own words.\n"
        "  - Use your general knowledge to give context, explain WHY something matters, draw analogies.\n"
        "  - Clearly separate what comes from the documents vs your own knowledge. "
        "e.g. 'Your notes mention X [2, p.3]. This relates to Y, which is important because...'\n\n"
        "IMPORTANT RULES:\n"
        "- NEVER fabricate document content. If you need info from the user's files, search first.\n"
        "- When writing notes, be thorough — use markdown headings, bullet points, specific facts.\n"
        "- If search returns no results, say so honestly.\n"
        "- For general knowledge, be helpful and accurate — you're not limited to the user's documents.\n"
    )


# ── Internal search pipeline ──────────────────────────────────────────────

async def _run_search_pipeline(
    registry: ToolRegistry, query: str, user_email: str,
) -> List[Dict[str, Any]]:
    """Full search pipeline: fan-out (vector + graph + entity) + HyDE -> rerank.

    Returns the top reranked chunks.
    """
    vtool = registry.get("vector_search")
    gtool = registry.get("graph_search")
    egtool = registry.get("entity_graph_search")

    collected: List[Dict[str, Any]] = []
    seen_ids: set = set()

    async def _run(tool, name, k, q):
        if not tool:
            return
        try:
            out = await tool.run(query=q, top_k=k, user_email=user_email)
            for i, item in enumerate(out.get("items", [])):
                item = dict(item)
                item.setdefault("source", name)
                item.setdefault("initial_rank", i)
                cid = item.get("chunkId")
                if cid and cid in seen_ids:
                    continue
                if cid:
                    seen_ids.add(cid)
                collected.append(item)
        except Exception as exc:
            logger.warning("Search %s failed: %s", name, exc)

    # Fan-out: all 3 search backends + HyDE
    tasks = [
        _run(vtool, "vector", 20, query),
        _run(gtool, "graph", 12, query),
        _run(egtool, "entity_graph", 10, query),
    ]
    # HyDE: pseudo-doc for embedding similarity
    if vtool:
        hyde = f"The answer to '{query}' is as follows: {' '.join(re.findall(r'[A-Za-z][a-z]{{2,}}', query)[:12])}"
        tasks.append(_run(vtool, "vector_hyde", 10, hyde))

    await asyncio.gather(*tasks)

    if not collected:
        return []

    # Rerank: hybrid RRF then Cohere semantic
    top = hybrid_rerank(collected, query, top_k=50) or naive_rerank(collected, query, top_k=50)
    if top:
        top = await cohere_rerank(top, query, top_k=20)

    log_brain_event("search.complete", {
        "query": query[:200], "collected": len(collected), "top": len(top),
    })
    return top


def _format_search_results(chunks: List[Dict[str, Any]]) -> str:
    """Format reranked chunks into readable text for the brain."""
    if not chunks:
        return "No relevant documents found. The user may not have uploaded files related to this query."
    parts: List[str] = []
    for i, c in enumerate(chunks[:15]):
        fname = c.get("file") or "unknown"
        page = f", p.{c['page']}" if c.get("page") else ""
        text = (c.get("text") or "")[:800].replace("\n", " ")
        parts.append(f"[{i + 1}] {fname}{page}\n{text}")
    return f"Found {len(chunks)} relevant passages:\n\n" + "\n---\n".join(parts)


# ── Node builders ──────────────────────────────────────────────────────────

def _build_init_node():
    """Build initial messages from history + system prompt + user question."""
    @traceable(name="init")
    async def init_node(state: AgentState) -> dict:
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": _build_system_prompt()},
        ]
        # Add conversation history so the brain can resolve references
        history = state.get("history") or []
        for msg in history[-8:]:
            messages.append({
                "role": msg.get("role", "user"),
                "content": (msg.get("content") or "")[:800],
            })
        # Add the current user message
        messages.append({"role": "user", "content": state["goal"]})

        log_brain_event("agent.init", {
            "goal": state["goal"][:200],
            "history_len": len(history),
        })

        return {
            "messages": messages,
            "step": 0,
            "scratchpad": [f"Goal: {state['goal'][:100]}"],
        }
    return init_node


def _build_brain_node(registry: ToolRegistry):
    """LLM brain: decides what to do next via tool calling."""

    _chain = None

    def _get_chain():
        nonlocal _chain
        if _chain is None:
            _chain = build_llm_chain(default_model="gpt-4o-mini")
        return _chain

    @traceable(name="brain")
    async def brain_node(state: AgentState) -> dict:
        chain = _get_chain()
        if not chain:
            return {
                "answer": "LLM not configured. Please check your API keys.",
                "status": "error",
                "pending_calls": [],
            }

        messages = state.get("messages") or []
        step = state.get("step", 0) + 1
        max_steps = state.get("max_steps", 10)

        # Safety: force a final text response if we hit max steps
        force_text = step >= max_steps
        tool_kwargs = {} if force_text else {
            "tools": _BRAIN_TOOLS,
            "tool_choice": "auto",
        }

        cfg = chain[0]

        def _call():
            return cfg.client.chat.completions.create(
                model=cfg.model,
                messages=messages,
                temperature=0.1,
                max_tokens=2048,
                **tool_kwargs,
            )

        try:
            resp = await asyncio.to_thread(_call)
        except Exception as exc:
            logger.exception("Brain LLM call failed")
            return {
                "answer": f"I encountered an error: {exc}",
                "status": "error",
                "pending_calls": [],
                "errors": [f"brain: {exc}"],
            }

        choice = resp.choices[0] if resp.choices else None
        if not choice:
            return {"answer": "No response from LLM.", "status": "error", "pending_calls": []}

        msg = choice.message
        # Log usage + cost
        usage = getattr(resp, "usage", None)
        if usage:
            log_llm_cost(
                caller="brain",
                provider=cfg.provider,
                model=cfg.model,
                prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
                step=step,
            )

        # Case 1: Tool calls — brain wants to use tools
        if msg.tool_calls:
            assistant_msg = {
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in msg.tool_calls
                ],
            }
            calls = [
                {"id": tc.id, "name": tc.function.name, "arguments": tc.function.arguments}
                for tc in msg.tool_calls
            ]
            tool_names = ", ".join(c["name"] for c in calls)
            log_brain_event("brain.tool_calls", {"step": step, "tools": tool_names})
            return {
                "messages": [assistant_msg],
                "pending_calls": calls,
                "step": step,
                "scratchpad": [f"Step {step}: calling {tool_names}"],
            }

        # Case 2: Text response — brain is done
        answer = msg.content or ""
        assistant_msg = {"role": "assistant", "content": answer}
        log_brain_event("brain.final_answer", {"step": step, "answer_len": len(answer)})
        return {
            "messages": [assistant_msg],
            "answer": answer,
            "pending_calls": [],
            "step": step,
            "status": "complete",
            "scratchpad": [f"Step {step}: final answer ({len(answer)} chars)"],
        }
    return brain_node


def _build_tool_executor_node(registry: ToolRegistry):
    """Execute the brain's tool calls and add results to the conversation."""

    @traceable(name="tools")
    async def tool_executor_node(state: AgentState) -> dict:
        calls = state.get("pending_calls") or []
        user_email = state.get("user_email") or ""
        tool_messages: List[Dict[str, Any]] = []
        new_chunks: List[Dict[str, Any]] = []
        action_results: Dict[str, Any] = dict(state.get("action_results") or {})
        scratchpad_items: List[str] = []

        for call in calls:
            name = call["name"]
            try:
                args = json.loads(call["arguments"]) if isinstance(call["arguments"], str) else call["arguments"]
            except json.JSONDecodeError:
                tool_messages.append({
                    "role": "tool", "tool_call_id": call["id"],
                    "content": "Error: invalid JSON arguments",
                })
                continue

            result_text = ""
            try:
                if name == "search_documents":
                    query = args.get("query", "")
                    chunks = await _run_search_pipeline(registry, query, user_email)
                    new_chunks.extend(chunks)
                    result_text = _format_search_results(chunks)
                    scratchpad_items.append(f"search_documents({query[:60]!r}) -> {len(chunks)} chunks")

                elif name == "schedule_meeting":
                    tool = registry.get("create_event")
                    if not tool:
                        result_text = "Error: calendar service not available"
                    else:
                        start = args.get("start", "")
                        end = args.get("end")
                        out = await tool.run(
                            user_email=user_email,
                            title=args.get("title", "Untitled"),
                            start=start, end=end,
                            description=args.get("description"),
                        )
                        action_results["create_event"] = out
                        if out.get("error"):
                            result_text = f"Failed to create event: {out['error']}"
                        else:
                            event = out.get("event", out)
                            result_text = f"Meeting scheduled successfully: {json.dumps(event, default=str)[:400]}"
                        scratchpad_items.append(f"schedule_meeting({args.get('title', '')!r})")

                elif name == "create_task":
                    event_tool = registry.get("create_event")
                    task_tool = registry.get("create_task")
                    if not event_tool or not task_tool:
                        result_text = "Error: task service not available"
                    else:
                        due_date = args.get("due_date") or (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat()
                        event_out = await event_tool.run(
                            user_email=user_email,
                            title=f"Task: {args.get('title', 'Untitled')}",
                            start=f"{due_date}T09:00:00",
                            description="Auto-created event to host a task.",
                        )
                        event_id = (event_out.get("event") or {}).get("id")
                        if not event_id:
                            result_text = f"Failed to create host event for task: {event_out}"
                        else:
                            task_out = await task_tool.run(
                                user_email=user_email,
                                event_id=event_id,
                                title=args.get("title", "Untitled"),
                                description=args.get("description"),
                                due_date=due_date,
                                priority=args.get("priority", "MEDIUM"),
                            )
                            action_results["create_task"] = task_out
                            result_text = f"Task created: {json.dumps(task_out, default=str)[:400]}"
                        scratchpad_items.append(f"create_task({args.get('title', '')!r})")

                elif name == "create_note":
                    tool = registry.get("create_note")
                    if not tool:
                        result_text = "Error: notes service not available"
                    else:
                        out = await tool.run(
                            user_email=user_email,
                            title=args.get("title", "Untitled Note"),
                            content=args.get("content", ""),
                        )
                        action_results["create_note"] = out
                        if out.get("error"):
                            result_text = f"Failed to create note: {out['error']}"
                        else:
                            result_text = f"Note created successfully with title: {args.get('title', 'Untitled')}"
                        scratchpad_items.append(f"create_note({args.get('title', '')!r})")

                elif name == "edit_note":
                    tool = registry.get("edit_note")
                    if not tool:
                        result_text = "Error: notes service not available"
                    else:
                        out = await tool.run(
                            user_email=user_email,
                            note_id=args.get("note_id", ""),
                            title=args.get("title"),
                            content=args.get("content", ""),
                        )
                        action_results["edit_note"] = out
                        result_text = f"Note updated: {json.dumps(out, default=str)[:400]}"
                        scratchpad_items.append(f"edit_note({args.get('note_id', '')!r})")

                elif name == "list_notes":
                    tool = registry.get("edit_note")
                    if not tool:
                        result_text = "Error: notes service not available"
                    else:
                        out = await tool.list_notes(user_email)
                        notes = out.get("notes", [])
                        if notes:
                            lines = [f'- id: "{n["id"]}", title: "{n["title"]}"' for n in notes[:20]]
                            result_text = "User's notes:\n" + "\n".join(lines)
                        else:
                            result_text = "The user has no notes yet."
                        scratchpad_items.append(f"list_notes() -> {len(notes)} notes")

                elif name == "get_calendar":
                    tool = registry.get("get_meetings")
                    if not tool:
                        result_text = "Error: calendar service not available"
                    else:
                        out = await tool.run(
                            start=args.get("start", ""),
                            end=args.get("end", ""),
                            user_email=user_email,
                        )
                        action_results["get_meetings"] = out
                        if isinstance(out, list):
                            result_text = f"Found {len(out)} events: {json.dumps(out, default=str)[:800]}"
                        else:
                            result_text = json.dumps(out, default=str)[:800]
                        scratchpad_items.append(f"get_calendar({args.get('start', '')} to {args.get('end', '')})")

                else:
                    result_text = f"Unknown tool: {name}"

            except Exception as exc:
                logger.exception("Tool %s failed", name)
                result_text = f"Tool {name} failed: {exc}"

            tool_messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "content": result_text,
            })

        return {
            "messages": tool_messages,
            "all_chunks": new_chunks,
            "action_results": action_results,
            "pending_calls": [],
            "scratchpad": scratchpad_items,
        }
    return tool_executor_node


def _build_finalize_node():
    """Post-processing: evidence scoring, guardrails, source extraction."""
    @traceable(name="finalize")
    async def finalize_node(state: AgentState) -> dict:
        answer = state.get("answer") or ""
        chunks = state.get("all_chunks") or []
        min_ev = float(os.getenv("MIN_EVIDENCE", "0.20"))
        max_halluc = float(os.getenv("MAX_HALLUCINATION", "0.40"))

        ev = 0.0
        halluc = 0.0
        status = state.get("status") or "complete"

        if chunks:
            ev = _evidence_score(answer, chunks)
            halluc = _hallucination_score(answer, chunks)

            if halluc > max_halluc:
                answer = (
                    "**Note:** Some claims in this answer could not be verified against "
                    "the source documents. Please cross-check the details.\n\n" + answer
                )
                status = "hallucination_warning"
                log_event("guardrail.hallucination", {"score": halluc, "evidence": ev})
            elif ev < min_ev and status != "error":
                status = "low_evidence"

        # Extract sources
        seen: set = set()
        sources: List[Dict[str, Any]] = []
        for c in chunks[:12]:
            key = (c.get("file") or "unknown", c.get("page") or 0)
            if key not in seen:
                seen.add(key)
                sources.append({
                    "file": key[0], "page": key[1] or None,
                    "preview": (c.get("text") or "")[:120].replace("\n", " "),
                })

        log_event("answer.eval", {
            "evidence_score": ev, "hallucination_score": halluc, "status": status,
        })

        # Save to memory
        session_id = state.get("session_id")
        if session_id:
            append_message(session_id, "assistant", answer, user_email=state.get("user_email", ""))

        return {
            "answer": answer,
            "sources": sources,
            "evidence_score": ev,
            "status": status,
            "scratchpad": [f"Finalize: ev={ev:.2f} halluc={halluc:.2f} status={status}"],
        }
    return finalize_node


# ── Conditional edges ──────────────────────────────────────────────────────

def _after_brain(state: AgentState) -> str:
    """After brain: execute tools or finalize."""
    if state.get("pending_calls"):
        return "tools"
    return "finalize"


# ── Build the graph ────────────────────────────────────────────────────────

def build_agent_graph(registry: ToolRegistry) -> Any:
    """Construct the agentic brain loop.

    init -> brain <-> tools (loop) -> finalize -> END
    """
    graph = StateGraph(AgentState)

    graph.add_node("init", _build_init_node())
    graph.add_node("brain", _build_brain_node(registry))
    graph.add_node("tools", _build_tool_executor_node(registry))
    graph.add_node("finalize", _build_finalize_node())

    graph.set_entry_point("init")
    graph.add_edge("init", "brain")
    graph.add_conditional_edges("brain", _after_brain, {
        "tools": "tools",
        "finalize": "finalize",
    })
    graph.add_edge("tools", "brain")
    graph.add_edge("finalize", END)

    return graph.compile()


# ── Public API ─────────────────────────────────────────────────────────────

_compiled_graph: Any = None


def get_agent_graph(registry: ToolRegistry) -> Any:
    """Return (or build) the singleton compiled graph."""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_agent_graph(registry)
    return _compiled_graph


async def run_agent_graph(
    registry: ToolRegistry,
    goal: str,
    user_email: str = "",
    session_id: str = "",
    max_iters: int = 6,
    min_hits: int = 6,
) -> Dict[str, Any]:
    """Run the agentic pipeline and return the result dict."""
    graph = get_agent_graph(registry)

    history = get_history(session_id, user_email=user_email) if session_id else []
    if session_id:
        append_message(session_id, "user", goal, user_email=user_email)

    initial_state: AgentState = {
        "goal": goal,
        "user_email": user_email,
        "session_id": session_id,
        "history": history,
        "messages": [],
        "pending_calls": [],
        "all_chunks": [],
        "answer": "",
        "sources": [],
        "evidence_score": 0.0,
        "status": "",
        "action_results": {},
        "step": 0,
        "max_steps": 10,
        "scratchpad": [],
        "errors": [],
    }

    result = await graph.ainvoke(initial_state)

    return {
        "goal": goal,
        "answer": result.get("answer", ""),
        "sources": result.get("sources", []),
        "chunks": result.get("all_chunks", []),
        "confidence": result.get("evidence_score", 0),
        "evidence_score": result.get("evidence_score", 0),
        "status": result.get("status", ""),
        "scratchpad": result.get("scratchpad", []),
        "action_results": result.get("action_results", {}),
    }


async def stream_agent_graph(
    registry: ToolRegistry,
    goal: str,
    user_email: str = "",
    session_id: str = "",
    max_iters: int = 6,
    min_hits: int = 6,
):
    """Async generator that yields SSE-ready dicts as the brain loop runs.

    Yields:
      {"type": "status", "node": "<node_name>", "detail": "..."}
      {"type": "token",  "token": "<text>"}
      {"type": "sources", "sources": [...]}
      {"type": "done",   ...full result...}
      {"type": "error",  "detail": "..."}
    """
    graph = get_agent_graph(registry)

    history = get_history(session_id, user_email=user_email) if session_id else []
    if session_id:
        append_message(session_id, "user", goal, user_email=user_email)

    initial_state: AgentState = {
        "goal": goal,
        "user_email": user_email,
        "session_id": session_id,
        "history": history,
        "messages": [],
        "pending_calls": [],
        "all_chunks": [],
        "answer": "",
        "sources": [],
        "evidence_score": 0.0,
        "status": "",
        "action_results": {},
        "step": 0,
        "max_steps": 10,
        "scratchpad": [],
        "errors": [],
    }

    _NODE_LABELS = {
        "init": "Understanding your request...",
        "brain": "Thinking...",
        "tools": "Working on it...",
        "finalize": "Preparing response...",
    }

    _TOOL_LABELS = {
        "search_documents": "Searching your documents...",
        "schedule_meeting": "Scheduling meeting...",
        "create_task": "Creating task...",
        "create_note": "Creating note...",
        "edit_note": "Updating note...",
        "list_notes": "Listing your notes...",
        "get_calendar": "Checking your calendar...",
    }

    final_state: Dict[str, Any] = {}

    async for event in graph.astream(initial_state):
        for node_name, node_output in event.items():
            # Dynamic status based on what tools are being called
            if node_name == "brain" and isinstance(node_output, dict) and node_output.get("pending_calls"):
                for call in node_output["pending_calls"]:
                    label = _TOOL_LABELS.get(call.get("name"), "Processing...")
                    yield {"type": "status", "node": "tools", "detail": label}
            else:
                yield {
                    "type": "status",
                    "node": node_name,
                    "detail": _NODE_LABELS.get(node_name, node_name),
                }
            # Accumulate state
            if isinstance(node_output, dict):
                for k, v in node_output.items():
                    if k in ("messages", "all_chunks", "scratchpad", "errors") and isinstance(v, list):
                        final_state.setdefault(k, []).extend(v)
                    else:
                        final_state[k] = v

    answer = final_state.get("answer", "")
    sources = final_state.get("sources", [])
    status = final_state.get("status", "")

    # Stream the brain's answer token-by-token to the client.
    # We stream the brain's own answer directly — it already incorporated
    # document chunks + general knowledge intelligently.  Re-synthesizing
    # through a strict "chunks-only" prompt would make the answer worse.
    if answer:
        for i in range(0, len(answer), 4):
            yield {"type": "token", "token": answer[i:i + 4]}

    if sources:
        yield {"type": "sources", "sources": sources}

    # Save streamed answer to memory
    if session_id:
        append_message(session_id, "assistant", answer, user_email=user_email)

    yield {
        "type": "done",
        "goal": goal,
        "answer": answer,
        "sources": sources,
        "confidence": final_state.get("evidence_score", 0),
        "evidence_score": final_state.get("evidence_score", 0),
        "status": status,
        "scratchpad": final_state.get("scratchpad", []),
        "action_results": final_state.get("action_results", {}),
    }
