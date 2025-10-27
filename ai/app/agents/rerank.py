from __future__ import annotations

from typing import Any, Dict, List


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
