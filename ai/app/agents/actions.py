"""Standalone action handlers for calendar events, tasks, and notes.

These were extracted from BrainAgent so the LangGraph pipeline can call
them without dragging in the full (now dead) BrainAgent class.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.core.tool_registry import ToolRegistry
from app.util.log import log_event

logger = logging.getLogger("intellidoc.actions")


def _parse_llm_json(raw: str) -> Dict[str, Any]:
    """Parse JSON from LLM output, stripping markdown code fences."""
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    if not text.startswith("{"):
        brace = text.find("{")
        if brace != -1:
            text = text[brace:]
    last = text.rfind("}")
    if last != -1:
        text = text[: last + 1]
    return json.loads(text)


# ── Calendar / Meetings ──────────────────────────────────────────────────


async def get_meetings(
    registry: ToolRegistry, question: str, user_email: Optional[str] = None
) -> Dict[str, Any]:
    """Extract dates from *question* via LLM, then fetch calendar events."""
    llm = registry.get("llm_summarize")
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

    resp = await llm.run(question=question, prompt=prompt, chunks=[])
    raw = resp.get("answer", "{}")

    try:
        date_info = json.loads(raw)
        start = date_info.get("start")
        end = date_info.get("end")
    except json.JSONDecodeError as e:
        logger.error("Failed to parse LLM date response: %s, raw=%r", e, raw[:200])
        return {"error": "Could not parse dates from LLM response", "raw": raw}

    if not start or not end:
        return {"error": "LLM did not provide start or end date", "raw": raw}

    meetings_tool = registry.get("get_meetings")
    if not meetings_tool:
        return {"error": "get_meetings tool not found"}

    return await meetings_tool.run(start=start, end=end, user_email=user_email)


# ── Create Event ─────────────────────────────────────────────────────────


async def handle_create_event(
    registry: ToolRegistry, goal: str, user_email: Optional[str]
) -> Dict[str, Any]:
    """LLM extracts event details → CreateEventTool persists it."""
    llm = registry.get("llm_summarize")
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
    except (ValueError, json.JSONDecodeError):
        logger.error("Failed to parse create_event LLM response: %r", raw[:300])
        return {"error": "Could not parse event details", "raw": raw}

    tool = registry.get("create_event")
    if not tool:
        return {"error": "create_event tool not registered"}

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


# ── Create Task ──────────────────────────────────────────────────────────


async def handle_create_task(
    registry: ToolRegistry, goal: str, user_email: Optional[str]
) -> Dict[str, Any]:
    """LLM extracts task details → auto-creates a host event → CreateTaskTool."""
    llm = registry.get("llm_summarize")
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
    except (ValueError, json.JSONDecodeError):
        logger.error("Failed to parse create_task LLM response: %r", raw[:300])
        return {"error": "Could not parse task details", "raw": raw}

    create_event_tool = registry.get("create_event")
    if not create_event_tool:
        return {"error": "create_event tool not registered"}

    due_date = details.get("due_date") or str(tomorrow)
    due_time = details.get("due_time") or "09:00"
    try:
        datetime.strptime(due_date, "%Y-%m-%d")
    except ValueError:
        logger.warning("LLM returned non-date due_date %r, falling back to tomorrow", due_date)
        due_date = str(tomorrow)
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

    tool = registry.get("create_task")
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


# ── Notes ────────────────────────────────────────────────────────────────


async def handle_create_note(
    registry: ToolRegistry, goal: str, user_email: Optional[str],
    chunks: Optional[List[Dict[str, Any]]] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """LLM extracts note details → CreateNoteTool persists it.

    When *chunks* are provided (from the RAG pipeline), they are included in
    the prompt so the LLM can write a note grounded in actual document content.
    When *history* is provided, it's included for resolving follow-up references.
    """
    llm = registry.get("llm_summarize")
    if not llm:
        return {"error": "llm_summarize tool not found"}

    # Build conversation context from history
    history_block = ""
    if history:
        lines = []
        for msg in history[-6:]:
            role = msg.get("role", "user")
            content = (msg.get("content") or "")[:400]
            lines.append(f"{role}: {content}")
        history_block = (
            "\n\nCONVERSATION HISTORY:\n" + "\n".join(lines)
            + "\n\nUse the conversation history to understand what 'it', 'the notes', "
            "'the research papers', etc. refer to.\n"
        )

    # Build context block from RAG chunks when available
    context_block = ""
    if chunks:
        passages = []
        for c in chunks[:15]:
            file_name = c.get("file") or "unknown"
            page = c.get("page") or ""
            text = (c.get("text") or "")[:600]
            ref = f"[{file_name}" + (f", p.{page}" if page else "") + "]"
            passages.append(f"{ref}\n{text}")
        context_block = (
            "\n\nDOCUMENT CONTEXT (from the user's uploaded files):\n"
            + "\n---\n".join(passages)
            + "\n\nIMPORTANT: Base the note content on the document context above. "
            "Summarize the key findings, data, and insights from these passages. "
            "Include specific facts, figures, and references.\n"
        )

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
        "- Return ONLY valid JSON. No extra text.\n"
        f"{context_block}"
        f"{history_block}\n"
        f"User message: {goal}"
    )

    resp = await llm.run(question=goal, prompt=prompt, chunks=[])
    raw = resp.get("answer", "{}")

    try:
        details = _parse_llm_json(raw)
    except (ValueError, json.JSONDecodeError):
        logger.error("Failed to parse create_note LLM response: %r", raw[:300])
        return {"error": "Could not parse note details", "raw": raw}

    tool = registry.get("create_note")
    if not tool:
        return {"error": "create_note tool not registered"}

    return await tool.run(
        user_email=user_email or "",
        title=details.get("title", "Untitled Note"),
        content=details.get("content", ""),
    )


async def handle_edit_note(
    registry: ToolRegistry, goal: str, user_email: Optional[str]
) -> Dict[str, Any]:
    """Find which note the user wants to edit, then apply edits via LLM."""
    llm = registry.get("llm_summarize")
    if not llm:
        return {"error": "llm_summarize tool not found"}

    edit_tool = registry.get("edit_note")
    if not edit_tool:
        return {"error": "edit_note tool not registered"}

    notes_resp = await edit_tool.list_notes(user_email or "")
    if notes_resp.get("error"):
        return notes_resp

    notes_list = notes_resp.get("notes", [])
    if not notes_list:
        return {"error": "You have no notes to edit. Create one first."}

    notes_summary = "\n".join(
        f'- id: "{n["id"]}", title: "{n["title"]}"' for n in notes_list[:20]
    )

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
        "- Use proper markdown: ## for headings, - for bullets, **bold** for emphasis.\n"
        "- Aim for at least 200-400 words of meaningful content.\n"
        "- If the user's message doesn't match any note, pick the closest one.\n"
        "- Return ONLY valid JSON. No extra text.\n\n"
        f"User message: {goal}"
    )

    resp = await llm.run(question=goal, prompt=prompt, chunks=[])
    raw = resp.get("answer", "{}")

    try:
        details = _parse_llm_json(raw)
    except (ValueError, json.JSONDecodeError):
        logger.error("Failed to parse edit_note LLM response: %r", raw[:300])
        return {"error": "Could not parse edit instructions", "raw": raw}

    note_id = details.get("note_id")
    if not note_id:
        return {"error": "Could not determine which note to edit"}

    kwargs: Dict[str, Any] = {"user_email": user_email or "", "note_id": note_id}
    if details.get("title") is not None:
        kwargs["title"] = details["title"]
    if details.get("content") is not None:
        kwargs["content"] = details["content"]

    return await edit_tool.run(**kwargs)
