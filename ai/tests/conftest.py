"""Shared test fixtures."""
from __future__ import annotations

import os
from unittest.mock import MagicMock

import pytest

# Ensure env vars are set before any app imports
os.environ.setdefault("NEO4J_URI", "bolt://localhost:7687")
os.environ.setdefault("NEO4J_USERNAME", "neo4j")
os.environ.setdefault("NEO4J_PASSWORD", "test")
os.environ.setdefault("COHERE_API_KEY", "test-key")


@pytest.fixture
def sample_chunks():
    """Return a realistic set of search result chunks."""
    return [
        {
            "file": "llama_paper.pdf",
            "text": "LLaMA uses SwiGLU activation function instead of ReLU. "
                    "SwiGLU was proposed by Shazeer (2020) and combines Swish and GLU.",
            "page": 3,
            "chunkId": "c1",
            "source": "vector",
            "initial_rank": 0,
            "score": 0.92,
        },
        {
            "file": "llama_paper.pdf",
            "text": "The model uses RMSNorm for pre-normalization, inspired by GPT-3. "
                    "This improves training stability.",
            "page": 4,
            "chunkId": "c2",
            "source": "vector",
            "initial_rank": 1,
            "score": 0.85,
        },
        {
            "file": "rag_paper.pdf",
            "text": "Retrieval-Augmented Generation combines parametric and non-parametric "
                    "memory. The retriever fetches relevant passages from a document store.",
            "page": 1,
            "chunkId": "c3",
            "source": "graph",
            "initial_rank": 0,
            "score": 0.78,
        },
        {
            "file": "rag_paper.pdf",
            "text": "RAG models can hot-swap the knowledge base without retraining. "
                    "This is a key advantage over purely parametric models.",
            "page": 5,
            "chunkId": "c4",
            "source": "entity_graph",
            "initial_rank": 0,
            "hops": 1,
            "score": 0.75,
        },
        {
            "file": "llama_paper.pdf",
            "text": "LLaMA-65B outperforms GPT-3 on most benchmarks despite being "
                    "trained on publicly available data only.",
            "page": 8,
            "chunkId": "c5",
            "source": "vector",
            "initial_rank": 2,
            "score": 0.70,
        },
    ]


@pytest.fixture
def mock_registry():
    """Return a mock ToolRegistry."""
    registry = MagicMock()
    registry.get.return_value = None
    registry.all.return_value = {}
    registry.names.return_value = []
    return registry
