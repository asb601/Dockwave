"""
IngestService – encapsulates the full document ingestion pipeline.

Responsibilities:
  1. Fetch the PDF from S3
  2. Extract text and chunk it (semantic boundaries + parent/child strategy)
  3. Generate embeddings via the Cohere API (batched, with retry)
  4. Persist chunks + graph relations to Neo4j
  5. Snapshot the user's knowledge JSON to S3

Keeping this logic here (rather than in the route handler) makes it
independently testable and easy to reuse from other entry-points.
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
from typing import List, Optional, Tuple

import numpy as np
import boto3
import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.services.graph import GraphClient

logger = logging.getLogger("intellidoc.ingest")
from app.services.pdf_extract import extract_text_from_pdf_bytes
from app.services.entity_extraction import EntityExtractor


# ---------------------------------------------------------------------------
# Text processing helpers
# ---------------------------------------------------------------------------

# Sentence-level splitter: creates base sentences for semantic grouping.
_sentence_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    encoding_name="cl100k_base",
    chunk_size=80,
    chunk_overlap=0,
    separators=["\n\n", "\n", ". ", "? ", "! ", "; ", " ", ""],
)

# Fallback fixed-size splitter (used when doc is too short for semantic chunking)
_fixed_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    encoding_name="cl100k_base",
    chunk_size=400,
    chunk_overlap=50,
    separators=["\n\n", "\n", ". ", " ", ""],
)

# Parent chunk splitter for synthesis context (larger windows)
_parent_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    encoding_name="cl100k_base",
    chunk_size=1200,
    chunk_overlap=100,
    separators=["\n\n", "\n", ". ", " ", ""],
)

# Maximum texts per Cohere embed API call (their hard limit is 96).
_EMBED_BATCH_SIZE = 96

# Semantic chunking: cosine similarity threshold.  Sentences with
# similarity below this are treated as topic boundaries.
_SEMANTIC_THRESHOLD_PERCENTILE = 25  # split at the 25th‑percentile valleys


def summarize(text: str, max_chars: int = 4000) -> str:
    """Return a bullet-point summary of the first *max_chars* of *text*."""
    lines = text[:max_chars].split(". ")
    return "\n".join(f"- {b.strip()}" for b in lines[:7] if b.strip())


_PAGE_HEADER_RE = re.compile(r"=== Page (\d+) /")


def _page_for_chunk(chunk_text: str) -> int:
    """Return the first page number (1-based) found in the chunk via the
    '=== Page N / M ===' header injected by extract_text_from_pdf_bytes.
    Returns 0 when no header is present (e.g., old re-ingested documents).
    """
    m = _PAGE_HEADER_RE.search(chunk_text)
    return int(m.group(1)) if m else 0


def _cosine_sim(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    denom = (np.linalg.norm(va) * np.linalg.norm(vb))
    if denom == 0:
        return 0.0
    return float(np.dot(va, vb) / denom)


def _semantic_chunk(
    sentences: List[str],
    embeddings: List[List[float]],
    max_tokens: int = 400,
) -> List[str]:
    """Group sentences into chunks based on semantic similarity.

    Computes cosine similarity between consecutive sentence embeddings.
    Splits at valleys (low-similarity points) while respecting max_tokens.
    """
    if len(sentences) <= 1:
        return sentences

    # Compute pairwise similarity of consecutive sentences
    similarities = [
        _cosine_sim(embeddings[i], embeddings[i + 1])
        for i in range(len(sentences) - 1)
    ]

    # Find the threshold: split at the lowest N% of similarities
    threshold = float(np.percentile(similarities, _SEMANTIC_THRESHOLD_PERCENTILE))

    chunks: List[str] = []
    current: List[str] = [sentences[0]]
    current_len = len(sentences[0].split())  # rough token estimate

    for i, sent in enumerate(sentences[1:], start=1):
        sent_len = len(sent.split())
        sim = similarities[i - 1]

        # Split if: similarity is below threshold AND chunk is non-tiny,
        # OR if adding this sentence would exceed max_tokens
        if (sim < threshold and current_len > 50) or (current_len + sent_len > max_tokens):
            chunks.append(" ".join(current))
            current = [sent]
            current_len = sent_len
        else:
            current.append(sent)
            current_len += sent_len

    if current:
        chunks.append(" ".join(current))

    return chunks


def _find_parent(child_text: str, parent_chunks: List[str]) -> Optional[str]:
    """Find the parent chunk that contains or best overlaps with the child."""
    child_lower = child_text[:200].lower()
    for parent in parent_chunks:
        if child_lower in parent.lower():
            return parent
    # Fallback: find parent with most word overlap
    child_words = set(child_lower.split())
    best_parent = None
    best_overlap = 0
    for parent in parent_chunks:
        parent_words = set(parent[:2000].lower().split())
        overlap = len(child_words & parent_words)
        if overlap > best_overlap:
            best_overlap = overlap
            best_parent = parent
    return best_parent


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

        # 3. Chunk (semantic boundaries with parent-doc strategy)
        chunks, parent_map = self._semantic_chunk_with_parents(text)
        summary = summarize(text)

        # 4. Embed child chunks
        embeddings = self._embed(chunks)

        # 5. Build chunk payloads (child chunks with parent context)
        char_offsets = self._char_offsets(chunks)
        chunk_payloads = [
            {
                "id": f"{file_id}:{i:04d}",
                "index": i,
                "text": chunks[i],
                "parent_text": parent_map.get(i, ""),
                "page": _page_for_chunk(chunks[i]),
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
            upserted = graph.upsert_file_chunks(file_id, chunk_payloads, user_email=effective_user)
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
            # Internal field used by the router to kick off background enrichment.
            # Not included in the HTTP response model.
            "_chunk_payloads": chunk_payloads,
        }

    def enrich_entities(self, chunk_payloads: list) -> None:
        """Run entity extraction + graph enrichment for the given chunk payloads.

        Designed to be called as a FastAPI BackgroundTask after the ingest
        response has already been sent to the caller.  All failures are
        logged but never re-raised so they cannot affect the main request.
        """
        if not chunk_payloads:
            return
        try:
            graph = GraphClient()
            try:
                graph.ensure_entity_indexes()
                extractor = EntityExtractor()
                batch_entities = extractor.extract_batch(
                    [p["text"] for p in chunk_payloads]
                )
                entity_count = 0
                for payload, entities in zip(chunk_payloads, batch_entities):
                    if entities:
                        entity_count += graph.upsert_chunk_entities(
                            payload["id"], entities
                        )
                logger.info(
                    "Background enrichment complete: %d entities across %d chunks",
                    entity_count,
                    len(chunk_payloads),
                )
            finally:
                graph.close()
        except Exception as exc:
            logger.warning("Entity enrichment failed (non-fatal): %s", exc)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _semantic_chunk_with_parents(self, text: str) -> Tuple[List[str], dict]:
        """Split text using semantic boundaries + build parent-doc mapping.

        Strategy:
          1. Split into sentences (~80 tokens each)
          2. Embed sentences via Cohere
          3. Group sentences by cosine-similarity valleys (semantic boundaries)
          4. Also split into large parent chunks (1200 tokens)
          5. Map each child → its parent for richer synthesis context

        Falls back to fixed-size chunking if the document is too short
        (< 10 sentences) or if embedding fails.

        Returns (child_chunks, parent_map) where parent_map is
        {child_index: parent_text}.
        """
        # Step 1: Split into sentences
        sentences = _sentence_splitter.split_text(text)

        if len(sentences) < 10:
            # Too short for semantic chunking — use fixed splitter
            child_chunks = _fixed_splitter.split_text(text)
            parent_chunks = _parent_splitter.split_text(text)
            parent_map = {}
            for i, child in enumerate(child_chunks):
                parent = _find_parent(child, parent_chunks)
                if parent and parent != child:
                    parent_map[i] = parent
            return child_chunks, parent_map

        # Step 2: Embed sentences for similarity computation
        try:
            sentence_embeddings = self._embed(sentences)
        except Exception as exc:
            logger.warning("Semantic embed failed, falling back to fixed chunking: %s", exc)
            child_chunks = _fixed_splitter.split_text(text)
            parent_chunks = _parent_splitter.split_text(text)
            parent_map = {}
            for i, child in enumerate(child_chunks):
                parent = _find_parent(child, parent_chunks)
                if parent and parent != child:
                    parent_map[i] = parent
            return child_chunks, parent_map

        # Step 3: Semantic grouping
        child_chunks = _semantic_chunk(sentences, sentence_embeddings, max_tokens=400)

        # Step 4: Parent chunks (larger context windows)
        parent_chunks = _parent_splitter.split_text(text)

        # Step 5: Map each child to its parent
        parent_map: dict = {}
        for i, child in enumerate(child_chunks):
            parent = _find_parent(child, parent_chunks)
            if parent and parent != child:
                parent_map[i] = parent

        logger.info(
            "Semantic chunking: %d sentences → %d child chunks, %d parent chunks",
            len(sentences), len(child_chunks), len(parent_chunks),
        )
        return child_chunks, parent_map

    def _fetch_pdf(self, s3_key: str) -> bytes:
        try:
            obj = self._s3.get_object(Bucket=self.bucket, Key=s3_key)
            return obj["Body"].read()
        except Exception as exc:
            raise RuntimeError(f"S3 get failed: {exc}") from exc

    def _embed(self, chunks: List[str]) -> List[List[float]]:
        """Embed chunks via Cohere v2 API with batching and retry.

        Cohere's embed endpoint has a hard limit of 96 texts per call.
        We split into batches, retry on transient HTTP errors, and
        concatenate the results.  A longer delay between batches avoids
        hitting the free-tier rate limit.
        """
        import time

        n_batches = (len(chunks) + _EMBED_BATCH_SIZE - 1) // _EMBED_BATCH_SIZE
        # Scale delay based on total batches — large docs need more breathing room
        batch_delay = 3.0 if n_batches <= 5 else 6.0
        logger.info("Embedding %d chunks in %d batches (%.1fs delay)", len(chunks), n_batches, batch_delay)

        all_embeddings: List[List[float]] = []
        for i in range(0, len(chunks), _EMBED_BATCH_SIZE):
            batch = chunks[i : i + _EMBED_BATCH_SIZE]
            embeddings = self._embed_batch(batch)
            all_embeddings.extend(embeddings)
            # Pause between batches to respect Cohere free-tier rate limits
            if i + _EMBED_BATCH_SIZE < len(chunks):
                time.sleep(batch_delay)
        return all_embeddings

    @retry(
        stop=stop_after_attempt(8),
        wait=wait_exponential(multiplier=2, min=5, max=120),
        retry=retry_if_exception_type(requests.exceptions.RequestException),
        reraise=True,
    )
    def _embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Embed a single batch (max 96 texts) with retry on transient failures."""
        resp = requests.post(
            "https://api.cohere.com/v2/embed",
            headers={"Authorization": f"Bearer {self.embeddings_api_key}"},
            json={
                "model": "embed-v4.0",
                "input_type": "search_document",
                "texts": texts,
                "embedding_types": ["float"],
            },
            timeout=60,
        )
        if resp.status_code == 429:
            retry_after = resp.headers.get("retry-after")
            wait_secs = float(retry_after) if retry_after else 60.0
            logger.warning("Cohere 429 — waiting %.0fs before retry", wait_secs)
            import time
            time.sleep(wait_secs)
            raise requests.exceptions.HTTPError("429 rate limited", response=resp)
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
