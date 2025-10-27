from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any
from ..services.graph import GraphClient
from ..util.auth import verify_service_token

router = APIRouter()

class KnowledgeRequest(BaseModel):
    user_id: str

@router.get('/user/{user_id}', dependencies=[Depends(verify_service_token)])
async def get_user_kb(user_id: str):
    graph = GraphClient()
    try:
        data = graph.get_user_knowledge_json(user_id)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
