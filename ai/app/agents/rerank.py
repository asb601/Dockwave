from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Tuple

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger("intellidoc.rerank")


def naive_rerank(chunks: List[Dict[str, Any]], query: str, top_k: int = 12) -> List[Dict[str, Any]]:
    # Basic heuristic reranker: prioritize shorter chunks containing more query tokens
    q_tokens = [t for t in query.lower().split() if len(t) > 2]
    def score(c: Dict[str, Any]) -> float:
        text = (c.get("text") or "").lower()
        hits = sum(text.count(t) for t in q_tokens)
        length_penalty = max(20, len(text))
        return hits * 1000.0 / length_penalty
    scored = sorted(chunks, key=score, reverse=True)
    return scored[:top_k]


# New: Hybrid rerank via Reciprocal Rank Fusion (RRF)
# Expect items collected from multiple sources with fields: file, text, source, initial_rank, score (optional)
# We dedupe by (file, first 64 chars of text) and fuse ranks across sources.

def _key_for_item(item: Dict[str, Any]) -> Tuple[str, str]:
    f = item.get("file") or ""
    t = (item.get("text") or "")[:64]
    return (f, t)


def hybrid_rerank(items: List[Dict[str, Any]], query: str, top_k: int = 15, k: int = 60) -> List[Dict[str, Any]]:
    if not items:
        return []

    # Group by dedup key
    buckets: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for it in items:
        buckets.setdefault(_key_for_item(it), []).append(it)

    # Compute RRF scores
    q_tokens = [t for t in query.lower().split() if len(t) > 2]
    fused: List[Tuple[float, Dict[str, Any]]] = []
    for key, group in buckets.items():
        rrf = 0.0
        best_repr = None
        for it in group:
            # smaller rank is better; ensure non-negative
            r = max(0, int(it.get("initial_rank", 0)))
            rrf += 1.0 / (k + 1 + r)
            if best_repr is None or r < int(best_repr.get("initial_rank", 0)):
                best_repr = it
        # small lexical bonus based on token overlap
        text = (best_repr.get("text") or "").lower() if best_repr else ""
        hits = sum(text.count(t) for t in q_tokens)
        bonus = min(0.2, hits * 0.02)  # cap the bonus
        # entity graph source bonus: structured graph results are more precise
        entity_bonus = 0.0
        if best_repr and best_repr.get("source") == "entity_graph":
            entity_bonus = 0.05
            # Direct matches (1-hop) get extra boost
            if best_repr.get("hops", 2) == 1:
                entity_bonus = 0.10
        total = rrf + bonus + entity_bonus
        if best_repr is None:
            continue
        best_repr = dict(best_repr)
        best_repr["rerank_score"] = total
        fused.append((total, best_repr))

    fused.sort(key=lambda x: x[0], reverse=True)
    reranked = [item for _, item in fused[:top_k]]
    return reranked


async def cohere_rerank(
    chunks: List[Dict[str, Any]],
    query: str,
    top_k: int = 15,
) -> List[Dict[str, Any]]:
    """Semantic reranking via the Cohere Rerank v3 API.

    Sends *query* + each chunk's text to the Cohere reranker, which reads
    every chunk and scores how well it answers the question.  Falls back
    to the input order if the API key is missing or the call fails.
    """
    api_key = os.getenv("COHERE_API_KEY") or os.getenv("embeedings_api", "")
    model = os.getenv("COHERE_RERANK_MODEL", "rerank-v3.5")
    if not api_key or not chunks:
        return chunks[:top_k]

    documents = [(c.get("text") or "")[:4000] for c in chunks]

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
        reraise=True,
    )
    async def _call_cohere():
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.cohere.com/v2/rerank",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model,
                    "query": query,
                    "documents": documents,
                    "top_n": top_k,
                },
            )
            resp.raise_for_status()
            return resp.json()

    try:
        data = await _call_cohere()
    except Exception as exc:
        logger.warning("Cohere rerank failed, returning hybrid order: %s", exc)
        return chunks[:top_k]

    results = data.get("results", [])
    reranked: List[Dict[str, Any]] = []
    for item in results:
        idx = item.get("index", 0)
        if 0 <= idx < len(chunks):
            entry = dict(chunks[idx])
            entry["rerank_score"] = float(item.get("relevance_score", 0))
            reranked.append(entry)

    return reranked
