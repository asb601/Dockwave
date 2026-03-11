from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from app.agents.brain import BrainAgent
from app.core.container import get_registry

router = APIRouter()


class RunAgentRequest(BaseModel):
    goal: str = Field(..., min_length=1, description="The user's question or goal")
    user_email: Optional[str] = Field(default=None, description="Authenticated user's email")
    max_iters: int = Field(default=4, ge=1, le=10, description="Maximum RAG iterations")
    min_hits: int = Field(default=6, ge=1, description="Minimum chunk hits before summarising")


@router.post("/run")
async def run_agent(req: RunAgentRequest):
    """
    Execute the BrainAgent for the given goal.

    Tools are resolved from the singleton ToolRegistry (built once from env
    vars) rather than instantiated per-request, which avoids repeated
    connection overhead.
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
        raise HTTPException(status_code=500, detail=f"Agent execution failed: {exc}") from exc
    return result
