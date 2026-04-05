#!/usr/bin/env python3
"""Golden query evaluation runner.

Reads golden_queries.jsonl, hits the /agent/ask endpoint, and measures:
  - Answer relevance (keyword overlap with expected answer)
  - Source accuracy (correct file cited)
  - Evidence score from the pipeline
  - Latency

Usage:
    python scripts/eval_golden.py [--base-url http://localhost:8000] [--email test@example.com]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import httpx

GOLDEN_PATH = Path(__file__).parent.parent / "docs" / "golden_queries.jsonl"


def _keyword_overlap(answer: str, expected: str) -> float:
    """Fraction of expected keywords found in the answer."""
    expected_tokens = {t.lower() for t in expected.split() if len(t) > 2}
    if not expected_tokens:
        return 1.0
    answer_lower = answer.lower()
    hits = sum(1 for t in expected_tokens if t in answer_lower)
    return hits / len(expected_tokens)


def _source_match(sources: list, expected_source: str) -> bool:
    """Check if the expected source file appears in the cited sources."""
    if expected_source == "both":
        return True  # Cross-doc questions — any source is valid
    for s in sources:
        if expected_source.lower() in (s.get("file") or "").lower():
            return True
    return False


def run_eval(base_url: str, email: str) -> dict:
    if not GOLDEN_PATH.exists():
        print(f"Golden queries file not found: {GOLDEN_PATH}")
        sys.exit(1)

    queries = []
    with open(GOLDEN_PATH) as f:
        for line in f:
            line = line.strip()
            if line:
                queries.append(json.loads(line))

    print(f"Running {len(queries)} golden queries against {base_url}\n")
    print(f"{'ID':<6} {'Score':>6} {'Src':>4} {'Ev':>6} {'Lat':>7}  Question")
    print("-" * 80)

    results = []
    total_relevance = 0.0
    total_source = 0
    total_evidence = 0.0

    with httpx.Client(timeout=120.0) as client:
        for q in queries:
            t0 = time.time()
            try:
                resp = client.post(
                    f"{base_url}/agent/ask",
                    json={"goal": q["question"], "userEmail": email},
                )
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                print(f"{q['id']:<6} {'ERR':>6} {'—':>4} {'—':>6} {'—':>7}  {q['question'][:50]}")
                results.append({**q, "error": str(exc)})
                continue

            latency = time.time() - t0
            answer = data.get("answer", "")
            sources = data.get("sources", [])
            ev = data.get("evidence_score", 0)

            relevance = _keyword_overlap(answer, q["expected_answer"])
            src_ok = _source_match(sources, q["expected_source"])

            total_relevance += relevance
            total_source += int(src_ok)
            total_evidence += ev

            print(
                f"{q['id']:<6} {relevance:>5.0%} {'✓' if src_ok else '✗':>4} "
                f"{ev:>5.1%} {latency:>6.1f}s  {q['question'][:50]}"
            )

            results.append({
                **q,
                "answer": answer[:300],
                "relevance": relevance,
                "source_match": src_ok,
                "evidence_score": ev,
                "latency_s": round(latency, 2),
                "status": data.get("status", ""),
            })

    n = len(queries)
    print("-" * 80)
    print(f"{'AVG':<6} {total_relevance/n:>5.0%} {total_source:>3}/{n} "
          f"{total_evidence/n:>5.1%} ")
    print(f"\nRelevance: {total_relevance/n:.1%}  |  Source accuracy: {total_source}/{n}  |  "
          f"Avg evidence: {total_evidence/n:.1%}")

    # Write detailed results
    out_path = Path(__file__).parent.parent / "docs" / "eval_results.jsonl"
    with open(out_path, "w") as f:
        for r in results:
            f.write(json.dumps(r, default=str) + "\n")
    print(f"\nDetailed results saved to {out_path}")

    return {
        "queries": n,
        "avg_relevance": total_relevance / n,
        "source_accuracy": total_source / n,
        "avg_evidence": total_evidence / n,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run golden query evaluation")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--email", default="test@example.com")
    args = parser.parse_args()
    run_eval(args.base_url, args.email)
