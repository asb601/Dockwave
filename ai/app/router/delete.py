import asyncio
import json
import logging
import os
import re
from typing import Optional

import boto3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.services.graph import GraphClient
from app.util.auth import verify_service_token

router = APIRouter()
logger = logging.getLogger("intellidoc.delete")


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class FileDeleteRequest(BaseModel):
    user_id: str
    user_email: Optional[str] = None
    file_id: str
    s3_bucket: Optional[str] = None
    s3_key: str


class FolderDeleteRequest(BaseModel):
    user_id: str
    user_email: Optional[str] = None
    folder_id: str


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _s3_client():
    return boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )


def _resolved_bucket(override: Optional[str] = None) -> str:
    bucket = override or os.getenv("AWS_S3_BUCKET") or os.getenv("AWS_BUCKET_NAME")
    if not bucket:
        raise HTTPException(status_code=500, detail="Missing AWS_S3_BUCKET configuration")
    return bucket


def _persist_knowledge(s3, bucket: str, user: str, knowledge: dict) -> Optional[str]:
    """Write knowledge.json snapshot; returns S3 key or None on failure."""
    try:
        safe_user = re.sub(r"[^a-zA-Z0-9._@-]", "_", user)
        prefix = (os.getenv("S3_PROJECT_PREFIX") or "GRAPH-RAG").rstrip("/")
        key = f"{prefix}/{safe_user}/knowledge.json"
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps(knowledge, separators=(",", ":")).encode("utf-8"),
            ContentType="application/json",
            CacheControl="no-cache",
        )
        return key
    except Exception as exc:
        logger.warning("Knowledge JSON persist failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/file", dependencies=[Depends(verify_service_token)])
async def delete_file(payload: FileDeleteRequest):
    """Delete a file from S3 and Neo4j, then snapshot updated knowledge."""
    bucket = _resolved_bucket(payload.s3_bucket)
    s3 = _s3_client()

    try:
        await asyncio.to_thread(s3.delete_object, Bucket=bucket, Key=payload.s3_key)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="S3 delete failed") from exc

    effective_user = payload.user_email or payload.user_id

    def _graph_delete():
        graph = GraphClient()
        try:
            graph.delete_file_by_id(payload.file_id)
            return graph.get_user_knowledge_json(effective_user)
        finally:
            graph.close()

    knowledge = await asyncio.to_thread(_graph_delete)
    knowledge_s3_key = _persist_knowledge(s3, bucket, effective_user, knowledge)
    return {"ok": True, "knowledge_s3_key": knowledge_s3_key}


@router.post("/folder", dependencies=[Depends(verify_service_token)])
async def delete_folder(payload: FolderDeleteRequest):
    """Delete a folder (and all its files/chunks) from S3 and Neo4j."""
    effective_user = payload.user_email or payload.user_id
    bucket = _resolved_bucket()
    s3 = _s3_client()

    # 1. Collect file S3 keys that live in this folder (uses public API, no _driver access)
    def _get_files():
        graph = GraphClient()
        try:
            return graph.get_folder_files(payload.folder_id)
        finally:
            graph.close()

    files = await asyncio.to_thread(_get_files)

    # 2. Delete S3 objects (best-effort)
    for f in files:
        if f.get("s3Key"):
            try:
                await asyncio.to_thread(s3.delete_object, Bucket=bucket, Key=f["s3Key"])
            except Exception as exc:
                logger.warning("S3 delete failed for %s: %s", f.get("s3Key"), exc)

    # 3. Delete folder + files + chunks in Neo4j, snapshot knowledge
    def _graph_delete():
        graph = GraphClient()
        try:
            graph.delete_folder_by_id(payload.folder_id)
            return graph.get_user_knowledge_json(effective_user)
        finally:
            graph.close()

    knowledge = await asyncio.to_thread(_graph_delete)
    knowledge_s3_key = _persist_knowledge(s3, bucket, effective_user, knowledge)
    return {"ok": True, "files_cleaned": len(files), "knowledge_s3_key": knowledge_s3_key}
