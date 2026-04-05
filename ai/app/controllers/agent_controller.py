from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional

from app.core.container import get_registry
from app.core.graph import run_agent_graph, stream_agent_graph
from app.util.auth import verify_service_token

router = APIRouter()
logger = logging.getLogger("intellidoc.agent")


class RunAgentRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=5000, description="The user's question or goal")
    user_email: Optional[str] = Field(default=None, description="Authenticated user's email")
    session_id: Optional[str] = Field(default=None, description="Chat session ID for memory")
    max_iters: int = Field(default=4, ge=1, le=10, description="Maximum RAG iterations")
    min_hits: int = Field(default=6, ge=1, le=50, description="Minimum chunk hits before summarising")


@router.post("/run", dependencies=[Depends(verify_service_token)])
async def run_agent(req: RunAgentRequest):
    """Execute the LangGraph agent pipeline for the given goal.

    Requires a valid service token (x-service-token header).  The caller
    (Next.js backend) must supply the user_email from the authenticated
    session — this endpoint does not perform user authentication itself.
    """
    registry = get_registry()
    try:
        result = await run_agent_graph(
            registry,
            goal=req.goal,
            user_email=req.user_email or "",
            session_id=req.session_id or "",
            max_iters=req.max_iters,
            min_hits=req.min_hits,
        )
    except Exception as exc:
        logger.exception("Agent execution failed for goal=%r", req.goal[:80])
        raise HTTPException(status_code=500, detail="Agent execution failed") from exc
    return result


@router.post("/stream", dependencies=[Depends(verify_service_token)])
async def stream_agent(req: RunAgentRequest):
    """SSE streaming version of the agent pipeline.

    Uses LangGraph's ``astream()`` for real per-node progress events,
    and streams the synthesis LLM call token-by-token via ``stream=True``.

    SSE event types:
      - event: status   → {"node": "route", "detail": "..."}
      - event: chunk    → {"token": "partial text"}
      - event: sources  → {"sources": [...]}
      - event: done     → full result payload
      - event: error    → {"detail": "..."}
    """
    registry = get_registry()

    async def event_generator():
        try:
            async for event in stream_agent_graph(
                registry,
                goal=req.goal,
                user_email=req.user_email or "",
                session_id=req.session_id or "",
                max_iters=req.max_iters,
                min_hits=req.min_hits,
            ):
                etype = event.pop("type", "status")
                if etype == "token":
                    yield _sse("chunk", event)
                else:
                    yield _sse(etype, event)

        except Exception as exc:
            logger.exception("Stream agent failed for goal=%r", req.goal[:80])
            yield _sse("error", {"detail": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse(event: str, data: dict) -> str:
    """Format a single SSE message."""
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"
