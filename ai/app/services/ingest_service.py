"""
IngestService – encapsulates the full document ingestion pipeline.

Responsibilities:
  1. Fetch the PDF from S3
  2. Extract text and chunk it
  3. Generate embeddings via the Cohere API
  4. Persist chunks + graph relations to Neo4j
  5. Snapshot the user's knowledge JSON to S3

Keeping this logic here (rather than in the route handler) makes it
independently testable and easy to reuse from other entry-points.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import List, Optional

import boto3
import requests

from app.services.graph import GraphClient
from app.services.pdf_extract import extract_text_from_pdf_bytes
from app.services.entity_extraction import EntityExtractor

logger = logging.getLogger("intellidoc.ingest_service")


# ---------------------------------------------------------------------------
# Text processing helpers
# ---------------------------------------------------------------------------

def dynamic_chunk(text: str) -> List[str]:
    """
    Split *text* into overlapping chunks whose size adapts to document length.

    Target is roughly 600 tokens (~2 400 chars). Chunk size is clamped to the
    range [1 200, 3 500] characters and overlap is fixed at 15 %.
    """
    length = len(text)
    if length < 5000:
        size = max(1200, int(length / 3) or 800)
    else:
        size = min(3500, 2400 + int((length / 20000) * 1000))
    overlap = int(size * 0.15)

    clean = " ".join(text.split())
    chunks: List[str] = []
    i = 0
    while i < len(clean):
        end = min(i + size, len(clean))
        chunks.append(clean[i:end])
        if end == len(clean):
            break
        i = end - overlap
    return chunks


def summarize(text: str, max_chars: int = 4000) -> str:
    """Return a bullet-point summary of the first *max_chars* of *text*."""
    lines = text[:max_chars].split(". ")
    return "\n".join(f"- {b.strip()}" for b in lines[:7] if b.strip())


# ---------------------------------------------------------------------------
# IngestService
# ---------------------------------------------------------------------------

class IngestService:
    """Orchestrates the end-to-end document ingestion pipeline."""

    def __init__(
        self,
        bucket: Optional[str] = None,
        embeddings_api_key: Optional[str] = None,
    ) -> None:
        self.bucket = bucket or os.getenv(
            "AWS_S3_BUCKET", os.getenv("AWS_BUCKET_NAME", "")
        )
        self.embeddings_api_key = embeddings_api_key or os.getenv("COHERE_API_KEY") or os.getenv("embeedings_api", "")
        self._s3 = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def ingest(
        self,
        *,
        user_email: str,
        user_id: str,
        file_id: str,
        file_name: str,
        s3_key: str,
        folder_id: Optional[str] = None,
        folder_name: Optional[str] = None,
    ) -> dict:
        """
        Run the full ingestion pipeline and return a result summary dict.

        Raises :class:`RuntimeError` on non-recoverable failures so that
        the route handler can translate them into the appropriate HTTP error.
        """
        effective_user = user_email or user_id

        # 1. Fetch PDF from S3
        pdf_bytes = self._fetch_pdf(s3_key)

        # 2. Extract text
        text = extract_text_from_pdf_bytes(pdf_bytes)
        if not text.strip():
            return {"ok": False, "chunks": 0, "vectors_upserted": 0, "summary": None}

        # 3. Chunk
        chunks = dynamic_chunk(text)
        summary = summarize(text)

        # 4. Embed
        embeddings = self._embed(chunks)

        # 5. Build chunk payloads
        char_offsets = self._char_offsets(chunks)
        chunk_payloads = [
            {
                "id": f"{file_id}:{i:04d}",
                "index": i,
                "text": chunks[i],
                "charStart": char_offsets[i],
                "charEnd": char_offsets[i] + len(chunks[i]),
                "embedding": embeddings[i],
            }
            for i in range(len(chunks))
        ]

        # 6. Persist to Neo4j
        graph = GraphClient()
        try:
            graph.upsert_user_folder_file(
                user_email=effective_user,
                folder_id=folder_id,
                folder_name=folder_name,
                file_id=file_id,
                file_name=file_name,
                s3_key=s3_key,
                summary=summary,
            )
            upserted = graph.upsert_file_chunks(file_id, chunk_payloads)

            # 6b. Entity extraction and graph enrichment
            entity_count = 0
            try:
                graph.ensure_entity_indexes()
                extractor = EntityExtractor()
                for payload in chunk_payloads:
                    entities = extractor.extract(payload["text"])
                    if entities:
                        entity_count += graph.upsert_chunk_entities(
                            payload["id"], entities
                        )
                logger.info(
                    "Entity extraction complete: %d entities across %d chunks",
                    entity_count,
                    len(chunk_payloads),
                )
            except Exception as exc:
                logger.warning("Entity extraction failed (non-fatal): %s", exc)

            knowledge = graph.get_user_knowledge_json(effective_user)
        finally:
            graph.close()

        # 7. Snapshot knowledge JSON to S3
        knowledge_s3_key = self._persist_knowledge(effective_user, knowledge)

        return {
            "ok": True,
            "chunks": len(chunks),
            "vectors_upserted": upserted,
            "summary": summary,
            "knowledge": knowledge,
            "knowledge_s3_key": knowledge_s3_key,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _fetch_pdf(self, s3_key: str) -> bytes:
        try:
            obj = self._s3.get_object(Bucket=self.bucket, Key=s3_key)
            return obj["Body"].read()
        except Exception as exc:
            raise RuntimeError(f"S3 get failed: {exc}") from exc

    def _embed(self, chunks: List[str]) -> List[List[float]]:
        resp = requests.post(
            "https://api.cohere.com/v2/embed",
            headers={"Authorization": f"Bearer {self.embeddings_api_key}"},
            json={
                "model": "embed-v4.0",
                "input_type": "search_document",
                "texts": chunks,
                "embedding_types": ["float"],
            },
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["embeddings"]["float"]

    @staticmethod
    def _char_offsets(chunks: List[str]) -> List[int]:
        offsets = []
        pos = 0
        for c in chunks:
            offsets.append(pos)
            pos += len(c)
        return offsets

    def _persist_knowledge(self, user: str, knowledge: dict) -> Optional[str]:
        """Write knowledge.json snapshot to S3; returns the S3 key or None on failure."""
        try:
            safe_user = re.sub(r"[^a-zA-Z0-9._@-]", "_", user)
            prefix = (os.getenv("S3_PROJECT_PREFIX") or "GRAPH-RAG").rstrip("/")
            key = f"{prefix}/{safe_user}/knowledge.json"
            self._s3.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=json.dumps(knowledge, ensure_ascii=False, separators=(",", ":")).encode(),
                ContentType="application/json",
                CacheControl="no-cache",
            )
            return key
        except Exception as exc:
            logger.warning("Failed to persist knowledge JSON: %s", exc)
            return None
