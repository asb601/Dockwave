"""
EntityExtractor – extract structured entities from text chunks using LLM tool calling.

Uses OpenAI-compatible function/tool calling for reliable structured output.
No JSON parsing or regex needed — the model returns typed arguments directly.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from app.core.llm_config import build_llm_client
from app.util.log import log_llm_cost

logger = logging.getLogger("docwave.entity_extraction")

# Tool schema for entity extraction — used via OpenAI tool calling
_ENTITY_TOOL = {
    "type": "function",
    "function": {
        "name": "store_entities",
        "description": "Store extracted named entities from the text.",
        "parameters": {
            "type": "object",
            "properties": {
                "entities": {
                    "type": "array",
                    "description": "List of extracted entities (max 15).",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Entity name, normalized and title-cased for proper nouns. Max 5 words.",
                            },
                            "type": {
                                "type": "string",
                                "enum": ["PERSON", "ORGANIZATION", "CONCEPT", "DATE", "LOCATION"],
                                "description": "Entity type category.",
                            },
                        },
                        "required": ["name", "type"],
                    },
                },
            },
            "required": ["entities"],
        },
    },
}

_SYSTEM_MSG = (
    "You are an entity extraction system. Analyze the provided text and extract "
    "all named entities (people, organizations, concepts, dates, locations). "
    "Merge duplicates. Skip generic stop-words. Use the store_entities tool to return results."
)


class EntityExtractor:
    """Extracts entities from text using LLM tool calling for reliable structured output."""

    def __init__(self) -> None:
        self._client = None
        self._provider: Optional[str] = None
        self._deployment: Optional[str] = None

    def _ensure_client(self) -> bool:
        if self._client is not None:
            return True
        extraction_model = os.getenv(
            "ENTITY_EXTRACTION_MODEL", "gpt-4o-mini"
        )
        cfg = build_llm_client(default_model=extraction_model)
        if cfg is None:
            logger.warning("No LLM configured for entity extraction")
            return False
        self._client = cfg.client
        self._provider = cfg.provider
        self._deployment = cfg.model
        return True

    def extract(self, chunk_text: str) -> List[Dict[str, str]]:
        """Extract entities from a single chunk using tool calling."""
        if not chunk_text.strip():
            return []
        if not self._ensure_client():
            return []

        try:
            resp = self._client.chat.completions.create(
                model=self._deployment,
                messages=[
                    {"role": "system", "content": _SYSTEM_MSG},
                    {"role": "user", "content": f"Extract entities from:\n\n{chunk_text[:3000]}"},
                ],
                tools=[_ENTITY_TOOL],
                tool_choice={"type": "function", "function": {"name": "store_entities"}},
                temperature=0.0,
                max_tokens=600,
            )
            usage = getattr(resp, "usage", None)
            if usage:
                log_llm_cost(
                    caller="entity_extraction",
                    provider=self._provider or "unknown",
                    model=self._deployment or "unknown",
                    prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                    completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
                )
            return self._parse_tool_response(resp)
        except Exception as e:
            logger.warning("Entity extraction failed: %s", e)
            return []

    def extract_batch(self, chunks: List[str]) -> List[List[Dict[str, str]]]:
        """Extract entities from multiple chunks, one tool call per chunk.

        Per-chunk tool calling is more reliable than batch JSON parsing
        and avoids truncation issues with large batches.
        """
        if not chunks:
            return []
        if not self._ensure_client():
            return [[] for _ in chunks]

        results: List[List[Dict[str, str]]] = []
        for i, text in enumerate(chunks):
            try:
                entities = self.extract(text)
                results.append(entities)
            except Exception as exc:
                logger.warning("Entity extraction failed for chunk %d: %s", i, exc)
                results.append([])
        return results

    def _parse_tool_response(self, resp: Any) -> List[Dict[str, str]]:
        """Parse the tool call response from the LLM."""
        if not resp.choices:
            return []

        message = resp.choices[0].message

        # Tool calls are returned in message.tool_calls
        if not hasattr(message, "tool_calls") or not message.tool_calls:
            # Fallback: try parsing content as JSON (for providers that don't support tools)
            if message.content:
                return self._fallback_parse(message.content)
            return []

        tool_call = message.tool_calls[0]
        try:
            args = json.loads(tool_call.function.arguments)
            raw_entities = args.get("entities", [])
        except (json.JSONDecodeError, AttributeError):
            logger.warning("Failed to parse tool call arguments")
            return []

        valid_types = {"PERSON", "ORGANIZATION", "CONCEPT", "DATE", "LOCATION"}
        entities = []
        for item in raw_entities[:15]:
            if not isinstance(item, dict):
                continue
            name = (item.get("name") or "").strip()
            etype = (item.get("type") or "").strip().upper()
            if name and etype in valid_types:
                entities.append({"name": name, "type": etype})
        return entities

    @staticmethod
    def _fallback_parse(raw: str) -> List[Dict[str, str]]:
        """Fallback for providers that don't support tool calling (e.g. Groq)."""
        import re
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r"\[.*\]", cleaned, re.DOTALL)
            if match:
                try:
                    parsed = json.loads(match.group())
                except json.JSONDecodeError:
                    return []
            else:
                return []
        if not isinstance(parsed, list):
            return []
        valid_types = {"PERSON", "ORGANIZATION", "CONCEPT", "DATE", "LOCATION"}
        return [
            {"name": item["name"].strip(), "type": item["type"].strip().upper()}
            for item in parsed[:15]
            if isinstance(item, dict)
            and item.get("name", "").strip()
            and item.get("type", "").strip().upper() in valid_types
        ]
