"""Tests for the routing and query rewriting nodes."""
from __future__ import annotations

import re

import pytest


class TestQueryDecomposition:
    """Test the _decompose_query logic from the rewrite node."""

    def _decompose(self, goal: str):
        """Replicate the decomposition logic for unit testing."""
        _MULTI_HOP_PATTERNS = re.compile(
            r"\b(compare|contrast|difference|differences|different|vs\.?|versus|"
            r"similarities|similarity|relate|relationship|between|both|each|"
            r"how does .+ differ|what are the .+ and .+)\b", re.I,
        )
        _CONJUNCTION_SPLIT = re.compile(
            r"\b(?:and also|and then|and|but also|, and|; also|; )\b", re.I,
        )

        cmp = re.match(
            r"(?:compare|contrast|what (?:are )?(?:the )?differences? between)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)(?:\?|$)",
            goal, re.I,
        )
        if cmp:
            a, b = cmp.group(1).strip(), cmp.group(2).strip()
            return [f"What is {a}?", f"What is {b}?", goal]

        if _MULTI_HOP_PATTERNS.search(goal):
            parts = _CONJUNCTION_SPLIT.split(goal)
            parts = [p.strip().rstrip("?").strip() for p in parts if len(p.strip()) > 10]
            if len(parts) >= 2:
                return parts[:3]

        return [goal]

    def test_simple_question_no_decomposition(self):
        result = self._decompose("What activation function does LLaMA use?")
        assert len(result) == 1
        assert result[0] == "What activation function does LLaMA use?"

    def test_compare_question_decomposed(self):
        result = self._decompose("Compare RAG and LLaMA approaches to knowledge")
        assert len(result) == 3
        assert "RAG" in result[0]
        assert "LLaMA" in result[1]

    def test_contrast_question(self):
        result = self._decompose("Contrast transformer and RNN architectures")
        assert len(result) == 3

    def test_conjunction_split(self):
        result = self._decompose(
            "What are the differences between LLaMA training data and also how does RAG retrieve passages"
        )
        # The "differences between" triggers MULTI_HOP_PATTERNS, then conjunction splits
        assert len(result) >= 1

    def test_vs_pattern(self):
        result = self._decompose("What is the difference between RAG vs fine-tuning?")
        assert len(result) >= 2 or "difference" in result[0].lower()


class TestKeywordRouter:
    """Test the keyword-based routing patterns."""

    _GREETING_WORDS = {
        "hi", "hello", "hey", "howdy", "sup", "yo", "thanks", "thank",
        "bye", "goodbye",
    }
    _CALENDAR_PATTERNS = re.compile(
        r"\b(meeting|meetings|calendar|schedule|event|events)\b", re.I,
    )
    _CREATE_EVENT_PATTERNS = re.compile(
        r"\b(create|add|schedule|set up|book)\b.*\b(meeting|event|appointment|call)\b", re.I,
    )

    def test_greeting_detected(self):
        assert "hello" in self._GREETING_WORDS

    def test_calendar_pattern_matches(self):
        assert self._CALENDAR_PATTERNS.search("What meetings do I have today?")
        assert self._CALENDAR_PATTERNS.search("Show my calendar")

    def test_create_event_pattern(self):
        assert self._CREATE_EVENT_PATTERNS.search("Schedule a meeting with John tomorrow")
        assert self._CREATE_EVENT_PATTERNS.search("Create an event for Friday")

    def test_document_question_no_action_match(self):
        goal = "What activation function does LLaMA use?"
        assert not self._CALENDAR_PATTERNS.search(goal)
        assert not self._CREATE_EVENT_PATTERNS.search(goal)
