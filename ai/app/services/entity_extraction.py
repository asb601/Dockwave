"""
EntityExtractor – extract structured entities from text chunks using the LLM.

Extracts: people, organizations, concepts/topics, dates, and locations
from each chunk and returns them as structured dicts for graph persistence.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger("intellidoc.entity_extraction")

_EXTRACTION_PROMPT = """Extract all named entities from the following text chunk.
Return ONLY a JSON array of objects. Each object must have:
- "name": the entity name (normalized, title-case for proper nouns)
- "type": one of "PERSON", "ORGANIZATION", "CONCEPT", "DATE", "LOCATION"

Rules:
- Merge duplicates (e.g. "AI" and "Artificial Intelligence" → pick canonical form)
- Skip generic stop-words and filler phrases
- Keep names specific and concise (max 5 words)
- Return an empty array [] if no entities found
- Maximum 15 entities per chunk

Text:
\"\"\"
{chunk_text}
\"\"\"

JSON array:"""


class EntityExtractor:
    """Extracts entities from text using the configured LLM."""

    def __init__(self) -> None:
        self._client = None
        self._provider: Optional[str] = None
        self._deployment: Optional[str] = None

    def _ensure_client(self) -> bool:
        if self._client is not None:
            return True

        try:
            from openai import AzureOpenAI, OpenAI
        except ImportError:
            logger.warning("openai package not installed; entity extraction disabled")
            return False

        azure_key = os.getenv("AZURE_OPENAI_API_KEY")
        azure_base = os.getenv("AZURE_OPENAI_API_BASE")
        if azure_key and azure_base:
            self._client = AzureOpenAI(
                api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-05-01-preview"),
                azure_endpoint=azure_base.rstrip("/"),
                api_key=azure_key,
            )
            self._provider = "azure-openai"
            self._deployment = os.getenv("AZURE_OPENAI_MODEL", "gpt-4o-mini")
            return True

        public_key = os.getenv("OPENAI_API_KEY")
        if public_key:
            self._client = OpenAI(api_key=public_key)
            self._provider = "openai"
            self._deployment = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
            return True

        logger.warning("No LLM configured for entity extraction")
        return False

    def extract(self, chunk_text: str) -> List[Dict[str, str]]:
        """Extract entities from a single chunk. Returns list of {name, type}."""
        if not chunk_text.strip():
            return []
        if not self._ensure_client():
            return []

        prompt = _EXTRACTION_PROMPT.format(chunk_text=chunk_text[:3000])

        try:
            resp = self._client.chat.completions.create(
                model=self._deployment,
                messages=[
                    {"role": "system", "content": "You extract structured entities from text. Respond only with valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                max_tokens=400,
            )
            raw = resp.choices[0].message.content.strip() if resp.choices else "[]"
            return self._parse_entities(raw)
        except Exception as e:
            logger.warning("Entity extraction LLM call failed: %s", e)
            return []

    def extract_batch(self, chunks: List[str]) -> List[List[Dict[str, str]]]:
        """Extract entities from multiple chunks. Returns parallel list of entity lists."""
        return [self.extract(c) for c in chunks]

    @staticmethod
    def _parse_entities(raw: str) -> List[Dict[str, str]]:
        """Parse LLM output into a clean list of entities."""
        # Strip markdown code fences if present
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            # Try to find a JSON array in the response
            match = re.search(r"\[.*\]", cleaned, re.DOTALL)
            if match:
                try:
                    parsed = json.loads(match.group())
                except json.JSONDecodeError:
                    logger.warning("Failed to parse entity JSON: %s", raw[:200])
                    return []
            else:
                return []

        if not isinstance(parsed, list):
            return []

        valid_types = {"PERSON", "ORGANIZATION", "CONCEPT", "DATE", "LOCATION"}
        entities = []
        for item in parsed[:15]:
            if not isinstance(item, dict):
                continue
            name = (item.get("name") or "").strip()
            etype = (item.get("type") or "").strip().upper()
            if name and etype in valid_types:
                entities.append({"name": name, "type": etype})
        return entities
