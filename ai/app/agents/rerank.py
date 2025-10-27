from __future__ import annotations

from typing import Any, Dict, List, Tuple


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
        total = rrf + bonus
        if best_repr is None:
            continue
        best_repr = dict(best_repr)
        best_repr["rerank_score"] = total
        fused.append((total, best_repr))

    fused.sort(key=lambda x: x[0], reverse=True)
    reranked = [item for _, item in fused[:top_k]]
    return reranked
