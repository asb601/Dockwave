from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import os

from app.agents.brain import BrainAgent
from app.agents.tools import GraphSearchTool, VectorSearchTool, LLMTool,GetMeetingsTool,LLMRouterTool

router = APIRouter()


class RunAgentRequest(BaseModel):
    goal: str
    user_email: str | None = None
    max_iters: int = 4
    min_hits: int = 6


@router.post("/run")
async def run_agent(req: RunAgentRequest):
    # Build tools from env
    neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.getenv("NEO4J_USERNAME", "neo4j")
    neo4j_password = os.getenv("NEO4J_PASSWORD", "please-change-me")
    api_base_url = os.getenv("ai_base_url", "http://localhost:8000")
    print(req.user_email)
  
    tools = [
        VectorSearchTool(uri=neo4j_uri, user=neo4j_user, password=neo4j_password),
        GraphSearchTool(uri=neo4j_uri, user=neo4j_user, password=neo4j_password),
        LLMTool(),
       
        GetMeetingsTool(api_base_url=api_base_url),
        LLMRouterTool()
    ]
    print("calling brain agent  ")
    brain = BrainAgent(tools)
    out = await brain.run(req.goal, user_email=req.user_email, max_iters=req.max_iters, min_hits=req.min_hits)
    return out
