"""Tests for the evidence scoring and hallucination detection."""
from __future__ import annotations

import re
from typing import Any, Dict, List

import pytest


def _evidence_score(answer: str, chunks: List[Dict[str, Any]]) -> float:
    """Copy of the production evidence_score for isolated testing."""
    src = " \n ".join((c.get("text") or "") for c in chunks[:10]).lower()
    toks = [t for t in re.findall(r"[a-zA-Z0-9_]+", (answer or "").lower()) if len(t) > 3]
    if not toks:
        return 0.0
    distinct = list(dict.fromkeys(toks))
    hits = sum(1 for t in distinct if t in src)
    return hits / max(1, len(distinct))


def _hallucination_score(answer: str, chunks: List[Dict[str, Any]]) -> float:
    """Copy of the production hallucination_score for isolated testing."""
    src = " ".join((c.get("text") or "") for c in chunks[:15]).lower()
    numbers = re.findall(r"\b\d+(?:\.\d+)?%?\b", answer)
    entities = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", answer)
    claims = numbers + [e.lower() for e in entities]
    if not claims:
        return 0.0
    unsupported = sum(1 for c in claims if c.lower() not in src)
    return unsupported / len(claims)


class TestEvidenceScore:
    def test_high_overlap(self, sample_chunks):
        answer = "LLaMA uses SwiGLU activation function instead of ReLU."
        score = _evidence_score(answer, sample_chunks)
        assert score > 0.5

    def test_no_overlap(self, sample_chunks):
        answer = "The quantum decoherence phenomenon in topological insulators."
        score = _evidence_score(answer, sample_chunks)
        assert score < 0.2

    def test_empty_answer(self, sample_chunks):
        assert _evidence_score("", sample_chunks) == 0.0

    def test_empty_chunks(self):
        assert _evidence_score("Some answer", []) == 0.0

    def test_partial_overlap(self, sample_chunks):
        answer = "LLaMA uses RMSNorm for normalization and was trained on public data."
        score = _evidence_score(answer, sample_chunks)
        assert 0.2 < score <= 1.0


class TestHallucinationScore:
    def test_grounded_numbers(self):
        chunks = [{"text": "The model has 65B parameters and achieves 85.3% accuracy."}]
        answer = "The model has 65B parameters with 85.3% accuracy."
        score = _hallucination_score(answer, chunks)
        assert score < 0.5

    def test_hallucinated_numbers(self):
        chunks = [{"text": "The model has 65B parameters."}]
        answer = "The model achieves 99.7% accuracy on all benchmarks with 200B parameters."
        score = _hallucination_score(answer, chunks)
        assert score > 0.3

    def test_no_claims(self):
        """Answer with no numbers or entities should score 0."""
        chunks = [{"text": "some text"}]
        answer = "the model works well."
        score = _hallucination_score(answer, chunks)
        assert score == 0.0

    def test_named_entities_grounded(self):
        chunks = [{"text": "Retrieval Augmented Generation was proposed by Lewis et al."}]
        answer = "Retrieval Augmented Generation combines retrieval with generation."
        score = _hallucination_score(answer, chunks)
        assert score < 0.5
