"""
ErrorHandlerMiddleware – catches unhandled exceptions and returns a
structured JSON error response instead of an HTML 500 page.

The correlation ID from the request state (set by LoggingMiddleware) is
included in the error response so clients can tie failures to log entries.
"""
from __future__ import annotations

import logging

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("docwave.errors")


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Catch-all middleware that converts unhandled exceptions to JSON."""

    async def dispatch(self, request: Request, call_next) -> Response:
        try:
            return await call_next(request)
        except Exception:
            correlation_id = getattr(request.state, "correlation_id", "unknown")
            logger.exception(
                "Unhandled exception [cid=%s] %s %s",
                correlation_id,
                request.method,
                request.url.path,
            )
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "An unexpected error occurred.",
                    "correlation_id": correlation_id,
                },
            )
