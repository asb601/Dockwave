from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from app.services.knowledge_service import KnowledgeService
from app.util.auth import verify_service_token

router = APIRouter()


class KnowledgeRequest(BaseModel):
    user_id: str


@router.get("/user/{user_id}", dependencies=[Depends(verify_service_token)])
async def get_user_kb(user_id: str):
    """Return the knowledge graph structure for a user."""
    try:
        return KnowledgeService().get_user_knowledge(user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
