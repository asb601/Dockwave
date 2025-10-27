from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import os, json, re, boto3
from ..services.graph import GraphClient
# Removed VectorClient; chunks live in Neo4j now
from ..util.auth import verify_service_token

router = APIRouter()

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

@router.post("/file", dependencies=[Depends(verify_service_token)])
async def delete_file(payload: FileDeleteRequest):
    # 1) Delete from S3
    bucket = payload.s3_bucket or os.getenv("AWS_S3_BUCKET", os.getenv("AWS_BUCKET_NAME"))
    if not bucket:
        raise HTTPException(status_code=500, detail="Missing AWS_S3_BUCKET")
    s3 = boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )
    try:
        s3.delete_object(Bucket=bucket, Key=payload.s3_key)
    except Exception as e:
        # Continue but report the issue
        raise HTTPException(status_code=502, detail=f"S3 delete failed: {e}")

    # 2) Delete graph file and its chunks
    graph = GraphClient()
    try:
        graph.delete_file_by_id(payload.file_id)
        knowledge = graph.get_user_knowledge_json(payload.user_email or payload.user_id)
    finally:
        graph.close()

    # 3) Persist knowledge JSON snapshot to S3
    knowledge_s3_key = None
    try:
        raw_user = (payload.user_email or payload.user_id)
        safe_user = re.sub(r"[^a-zA-Z0-9._@-]", "_", raw_user)
        project_prefix = (os.getenv("S3_PROJECT_PREFIX") or "GRAPH-RAG").rstrip("/")
        knowledge_s3_key = f"{project_prefix}/{safe_user}/knowledge.json"
        s3.put_object(Bucket=bucket, Key=knowledge_s3_key, Body=json.dumps(knowledge, separators=(",", ":")).encode("utf-8"), ContentType="application/json", CacheControl="no-cache")
    except Exception as e:
        print("Knowledge JSON persist (file delete) failed:", e)

    return {"ok": True, "knowledge": knowledge, "knowledge_s3_key": knowledge_s3_key}

@router.post("/folder", dependencies=[Depends(verify_service_token)])
async def delete_folder(payload: FolderDeleteRequest):
    # Gather file ids and s3 keys under the folder
    graph = GraphClient()
    files = []
    try:
        cypher = """
        MATCH (f:Folder {folderId: $folderId})-[:CONTAINS]->(fi:File)
        RETURN fi.fileId as id, fi.s3Key as s3Key
        """
        with graph._driver.session() as session:
            res = session.run(cypher, {"folderId": payload.folder_id})
            files = [{"id": r["id"], "s3Key": r["s3Key"]} for r in res]
    finally:
        graph.close()

    # Delete S3 objects for these files (best-effort)
    bucket_final = os.getenv("AWS_S3_BUCKET", os.getenv("AWS_BUCKET_NAME"))
    if bucket_final and files:
        s3 = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
        for f in files:
            try:
                if f.get("s3Key"):
                    s3.delete_object(Bucket=bucket_final, Key=f["s3Key"]) 
            except Exception as e:
                print("S3 delete (folder) failed for", f.get("s3Key"), e)

    # Delete folder, files, and chunks in Neo4j
    graph = GraphClient()
    try:
        graph.delete_folder_by_id(payload.folder_id)
        knowledge = graph.get_user_knowledge_json(payload.user_email or payload.user_id)
    finally:
        graph.close()

    # Persist updated knowledge snapshot
    knowledge_s3_key = None
    try:
        raw_user = (payload.user_email or payload.user_id)
        safe_user = re.sub(r"[^a-zA-Z0-9._@-]", "_", raw_user)
        project_prefix = (os.getenv("S3_PROJECT_PREFIX") or "GRAPH-RAG").rstrip("/")
        knowledge_s3_key = f"{project_prefix}/{safe_user}/knowledge.json"
        if bucket_final:
            s3 = boto3.client(
                "s3",
                region_name=os.getenv("AWS_REGION"),
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            )
            s3.put_object(Bucket=bucket_final, Key=knowledge_s3_key, Body=json.dumps(knowledge, separators=(",", ":")).encode("utf-8"), ContentType="application/json", CacheControl="no-cache")
    except Exception as e:
        print("Knowledge JSON persist (folder delete) failed:", e)

    return {"ok": True, "files_cleaned": len(files), "knowledge": knowledge, "knowledge_s3_key": knowledge_s3_key}
