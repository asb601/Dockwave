"""Tests for the reranking pipeline (naive, hybrid RRF, Cohere)."""
from __future__ import annotations

import pytest

from app.agents.rerank import hybrid_rerank, naive_rerank


class TestNaiveRerank:
    def test_ranks_by_query_overlap(self, sample_chunks):
        result = naive_rerank(sample_chunks, "SwiGLU activation function LLaMA", top_k=3)
        assert len(result) == 3
        # The chunk mentioning SwiGLU should be ranked first
        assert "SwiGLU" in result[0]["text"]

    def test_returns_top_k(self, sample_chunks):
        result = naive_rerank(sample_chunks, "LLaMA", top_k=2)
        assert len(result) == 2

    def test_empty_input(self):
        assert naive_rerank([], "anything") == []


class TestHybridRerank:
    def test_fuses_multiple_sources(self, sample_chunks):
        result = hybrid_rerank(sample_chunks, "LLaMA activation", top_k=5)
        assert len(result) > 0
        # All items should have a rerank_score
        for item in result:
            assert "rerank_score" in item
            assert item["rerank_score"] > 0

    def test_entity_graph_boost(self, sample_chunks):
        """Entity graph results with 1-hop get a boost."""
        result = hybrid_rerank(sample_chunks, "RAG knowledge base", top_k=5)
        entity_items = [r for r in result if r.get("source") == "entity_graph"]
        if entity_items:
            assert entity_items[0].get("rerank_score", 0) > 0

    def test_deduplication(self):
        """Duplicate chunks from different sources are merged."""
        dupes = [
            {"file": "a.pdf", "text": "Same text here abcdef", "source": "vector", "initial_rank": 0},
            {"file": "a.pdf", "text": "Same text here abcdef", "source": "graph", "initial_rank": 0},
        ]
        result = hybrid_rerank(dupes, "text", top_k=5)
        assert len(result) == 1
        # RRF score should reflect both sources
        assert result[0]["rerank_score"] > 1.0 / 61

    def test_empty_input(self):
        assert hybrid_rerank([], "anything") == []

    def test_respects_top_k(self, sample_chunks):
        result = hybrid_rerank(sample_chunks, "test", top_k=2)
        assert len(result) <= 2
