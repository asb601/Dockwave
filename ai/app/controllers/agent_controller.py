from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from app.agents.brain import BrainAgent
from app.core.container import get_registry
from app.util.auth import verify_service_token

router = APIRouter()
logger = logging.getLogger("intellidoc.agent")


class RunAgentRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=5000, description="The user's question or goal")
    user_email: Optional[str] = Field(default=None, description="Authenticated user's email")
    max_iters: int = Field(default=4, ge=1, le=10, description="Maximum RAG iterations")
    min_hits: int = Field(default=6, ge=1, le=50, description="Minimum chunk hits before summarising")


@router.post("/run", dependencies=[Depends(verify_service_token)])
async def run_agent(req: RunAgentRequest):
    """Execute the BrainAgent for the given goal.

    Requires a valid service token (x-service-token header).  The caller
    (Next.js backend) must supply the user_email from the authenticated
    session — this endpoint does not perform user authentication itself.
    """
    registry = get_registry()
    brain = BrainAgent(registry)
    try:
        result = await brain.run(
            req.goal,
            user_email=req.user_email,
            max_iters=req.max_iters,
            min_hits=req.min_hits,
        )
    except Exception as exc:
        logger.exception("Agent execution failed for goal=%r", req.goal[:80])
        raise HTTPException(status_code=500, detail="Agent execution failed") from exc
    return result
