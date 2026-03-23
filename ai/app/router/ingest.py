import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
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


@router.post(
    "/file",
    response_model=IngestResponse,
    dependencies=[Depends(verify_service_token)],
)
async def ingest_file(payload: IngestRequest, background_tasks: BackgroundTasks):
    """Ingest a PDF: extract text, chunk, embed, store in Neo4j, then snapshot
    knowledge to S3.

    Entity graph enrichment is deferred to a background task so the caller
    receives a response as soon as the core ingest is complete — typically
    several seconds faster than the previous synchronous approach.
    """
    service = IngestService(bucket=payload.s3_bucket)
    try:
        # ingest() is synchronous (boto3 + requests + neo4j).
        # Run in a thread pool so we don't block the asyncio event loop.
        result = await asyncio.to_thread(
            service.ingest,
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

    # Kick off entity extraction after we've already responded.
    chunk_payloads = result.pop("_chunk_payloads", [])
    if result.get("ok") and chunk_payloads:
        background_tasks.add_task(service.enrich_entities, chunk_payloads)

    return IngestResponse(**result)

