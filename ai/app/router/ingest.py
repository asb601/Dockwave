from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import os, json, re,requests
import boto3
import cohere
import asyncio
from typing import List, Optional
from ..services.graph import GraphClient
from ..util.auth import verify_service_token
from ..services.pdf_extract import extract_text_from_pdf_bytes
import dotenv

dotenv.load_dotenv()
router = APIRouter()
co = cohere.AsyncClient(os.getenv("embeedings_api", ""))

class IngestRequest(BaseModel):
    user_id: str  # internal user id (for namespace)
    user_email: Optional[str] = None
    file_id: str
    s3_bucket: Optional[str] = None
    s3_key: str
    file_name: str
    folder_id: Optional[str] = None
    folder_name: Optional[str] = None

class IngestResponse(BaseModel):
    ok: bool
    chunks: int
    vectors_upserted: int
    summary: Optional[str]
    knowledge: Optional[dict] = None
    knowledge_s3_key: Optional[str] = None


def dynamic_chunk(text: str) -> List[str]:
    # Heuristic: target ~ 600 tokens (~ 2400 chars) but adapt to total length.
    # Rough char->token ~4. Adjust chunk size between 1200 and 3500 chars.
    length = len(text)
    base = 2400
    if length < 5000:
        size = max(1200, int(length / 3) or 800)
    else:
        size = min(3500, base + int((length / 20000) * 1000))
    overlap = int(size * 0.15)
    clean = " ".join(text.split())
    chunks = []
    i = 0
    while i < len(clean):
        end = min(i + size, len(clean))
        chunks.append(clean[i:end])
        if end == len(clean):
            break
        i = end - overlap
    return chunks


def summarize(text: str, max_chars: int = 4000) -> str:
    t = text[:max_chars]
    lines = t.split('. ')
    bullets = lines[:7]
    return "\n".join(f"- {b.strip()}" for b in bullets if b.strip())


@router.post("/file", response_model=IngestResponse, dependencies=[Depends(verify_service_token)])
async def ingest_file(payload: IngestRequest):
    print("Ingesting file:", os.getenv("embeedings_api"))
    bucket = payload.s3_bucket or os.getenv("AWS_S3_BUCKET", os.getenv("AWS_BUCKET_NAME", "codeen601"))
    s3 = boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )
    try:
        obj = s3.get_object(Bucket=bucket, Key=payload.s3_key)
        data = obj["Body"].read()
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"S3 get failed: {e}")

    text = extract_text_from_pdf_bytes(data)
    if not text.strip():
        return IngestResponse(ok=False, chunks=0, vectors_upserted=0, summary=None, knowledge=None)

    chunks = dynamic_chunk(text)

    response = requests.post(
            "https://api.cohere.com/v2/embed",
            headers={
                "Authorization": f"Bearer {os.getenv('embeedings_api')}",
            },
            json={
                "model": "embed-v4.0",
                "input_type": "search_document",
                "texts": chunks,
                "embedding_types": [
                    "float"
                ]
            },
        )

    embeddings_json = response.json()
    # Get the float embeddings
    embeddings = embeddings_json["embeddings"]["float"]

    # Build chunk payloads for Neo4j (full switch to Neo4j storage)
    chunk_payloads = []
    for i, emb in enumerate(embeddings):
        chunk_payloads.append({
            "id": f"{payload.file_id}:{i:04d}",
            "index": i,
            "text": chunks[i],
            "charStart": sum(len(c) for c in chunks[:i]),
            "charEnd": sum(len(c) for c in chunks[: i + 1]),
            "embedding": emb,
        })
    summary = summarize(text)
    graph = GraphClient()
    # Upsert file and relations
    graph.upsert_user_folder_file(
        user_email=payload.user_email or payload.user_id,
        folder_id=payload.folder_id,
        folder_name=payload.folder_name,
        file_id=payload.file_id,
        file_name=payload.file_name,
        s3_key=payload.s3_key,
        summary=summary,
    )
    # Upsert chunks with embeddings into Neo4j
    upserted = graph.upsert_file_chunks(payload.file_id, chunk_payloads)

    knowledge = graph.get_user_knowledge_json(payload.user_email or payload.user_id)
    graph.close()

    # Persist knowledge JSON snapshot to S3
    knowledge_s3_key = None
    try:
        raw_user = (payload.user_email or payload.user_id)
        safe_user = re.sub(r"[^a-zA-Z0-9._@-]", "_", raw_user)
        project_prefix = (os.getenv("S3_PROJECT_PREFIX") or "GRAPH-RAG").rstrip("/")
        knowledge_s3_key = f"{project_prefix}/{safe_user}/knowledge.json"
        s3.put_object(
            Bucket=bucket,
            Key=knowledge_s3_key,
            Body=json.dumps(knowledge, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
            ContentType="application/json",
            CacheControl="no-cache",
        )
    except Exception as e:
        # Do not fail ingestion if snapshot write fails
        print("Knowledge JSON persist failed:", e)

    return IngestResponse(ok=True, chunks=len(chunks), vectors_upserted=upserted, summary=summary, knowledge=knowledge, knowledge_s3_key=knowledge_s3_key)

