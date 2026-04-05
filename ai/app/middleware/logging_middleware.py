"""
LoggingMiddleware – attaches a correlation ID to every request and logs
the start/end of each HTTP call with method, path, status, and latency.

A correlation ID travels through the full request lifecycle and is
returned in the ``x-correlation-id`` response header so clients can
correlate logs.
"""
from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("docwave.access")


class LoggingMiddleware(BaseHTTPMiddleware):
    """Structured request/response logging with per-request correlation IDs."""

    async def dispatch(self, request: Request, call_next) -> Response:
        correlation_id = (
            request.headers.get("x-correlation-id") or str(uuid.uuid4())
        )
        # Attach to request state so downstream code (tools, services) can read it
        request.state.correlation_id = correlation_id

        start = time.perf_counter()
        logger.info(
            "→ %s %s  [cid=%s]",
            request.method,
            request.url.path,
            correlation_id,
        )

        response: Response = await call_next(request)

        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(
            "← %s %s  status=%d  elapsed=%dms  [cid=%s]",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            correlation_id,
        )

        response.headers["x-correlation-id"] = correlation_id
        return response
