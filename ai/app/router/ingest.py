from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional

from app.services.ingest_service import IngestService
from app.util.auth import verify_service_token

router = APIRouter()


class IngestRequest(BaseModel):
    user_id: str
    user_email: Optional[str] = None
    file_id: str
    s3_bucket: Optional[str] = None
    s3_key: str = Field(..., min_length=1)
    file_name: str = Field(..., min_length=1)
    folder_id: Optional[str] = None
    folder_name: Optional[str] = None


class IngestResponse(BaseModel):
    ok: bool
    chunks: int
    vectors_upserted: int
    summary: Optional[str]
    knowledge: Optional[dict] = None
    knowledge_s3_key: Optional[str] = None


@router.post("/file", response_model=IngestResponse, dependencies=[Depends(verify_service_token)])
async def ingest_file(payload: IngestRequest):
    """Ingest a PDF file: extract, chunk, embed, index, and snapshot knowledge."""
    service = IngestService(bucket=payload.s3_bucket)
    try:
        result = service.ingest(
            user_email=payload.user_email or payload.user_id,
            user_id=payload.user_id,
            file_id=payload.file_id,
            file_name=payload.file_name,
            s3_key=payload.s3_key,
            folder_id=payload.folder_id,
            folder_name=payload.folder_name,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return IngestResponse(**result)

