"""Redis-backed conversation memory for the RAG agent.

Stores the last N messages per session so follow-up questions have context.
Falls back to in-memory dict when Redis is unavailable (local dev).
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger("docwave.memory")

_redis_client: Any = None
_fallback: Dict[str, List[Dict[str, str]]] = {}  # in-memory when no Redis

MAX_HISTORY = int(os.getenv("CHAT_HISTORY_LENGTH", "10"))
TTL_SECONDS = 60 * 60 * 24  # 24 hours


def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    url = os.getenv("REDIS_URL")
    if not url:
        return None
    try:
        import redis
        _redis_client = redis.from_url(url, decode_responses=True)
        _redis_client.ping()
        logger.info("Redis connected at %s", url)
        return _redis_client
    except Exception as exc:
        logger.warning("Redis unavailable (%s) — using in-memory fallback", exc)
        _redis_client = False  # sentinel: don't retry
        return None


def _key(session_id: str, user_email: str = "") -> str:
    if user_email:
        return f"docwave:chat:{user_email}:{session_id}"
    return f"docwave:chat:{session_id}"


def get_history(session_id: str, user_email: str = "") -> List[Dict[str, str]]:
    """Return the last MAX_HISTORY messages for *session_id*."""
    r = _get_redis()
    if r:
        raw = r.get(_key(session_id, user_email))
        if raw:
            return json.loads(raw)[-MAX_HISTORY:]
        return []
    return list(_fallback.get(session_id, []))[-MAX_HISTORY:]


def append_message(session_id: str, role: str, content: str, user_email: str = "") -> None:
    """Append a message and trim to MAX_HISTORY."""
    msg = {"role": role, "content": content}
    r = _get_redis()
    if r:
        key = _key(session_id, user_email)
        raw = r.get(key)
        history: List[Dict[str, str]] = json.loads(raw) if raw else []
        history.append(msg)
        history = history[-MAX_HISTORY:]
        r.set(key, json.dumps(history), ex=TTL_SECONDS)
    else:
        history = _fallback.setdefault(session_id, [])
        history.append(msg)
        _fallback[session_id] = history[-MAX_HISTORY:]


def clear_history(session_id: str, user_email: str = "") -> None:
    r = _get_redis()
    if r:
        r.delete(_key(session_id, user_email))
    else:
        _fallback.pop(session_id, None)


def close_redis() -> None:
    """Close the Redis connection pool (call on shutdown)."""
    global _redis_client
    if _redis_client and _redis_client is not False:
        try:
            _redis_client.close()
        except Exception:
            pass
    _redis_client = None
