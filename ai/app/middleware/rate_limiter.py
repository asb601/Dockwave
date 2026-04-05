"""
Redis-backed sliding-window rate limiter middleware.

Uses Redis ZSET to implement a sliding window counter per IP address.
Configurable via environment variables:
  RATE_LIMIT_REQUESTS  – max requests per window (default 30)
  RATE_LIMIT_WINDOW    – window size in seconds (default 60)
"""
from __future__ import annotations

import logging
import os
import time

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("intellidoc.ratelimit")

_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "30"))
_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW", "60"))

# Paths exempt from rate limiting
_EXEMPT_PATHS = {"/healthz", "/docs", "/openapi.json", "/redoc"}


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter backed by Redis ZSET."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip rate limiting for health/docs endpoints
        if request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        # Identify client by IP (supports X-Forwarded-For behind proxies)
        forwarded = request.headers.get("x-forwarded-for")
        client_ip = forwarded.split(",")[0].strip() if forwarded else (
            request.client.host if request.client else "unknown"
        )

        try:
            from app.services.memory import _get_redis
            r = _get_redis()

            key = f"ratelimit:{client_ip}"
            now = time.time()
            window_start = now - _WINDOW_SECONDS

            pipe = r.pipeline()
            # Remove expired entries
            pipe.zremrangebyscore(key, 0, window_start)
            # Count remaining
            pipe.zcard(key)
            # Add current request
            pipe.zadd(key, {f"{now}": now})
            # Set TTL so keys don't linger forever
            pipe.expire(key, _WINDOW_SECONDS + 10)
            results = pipe.execute()

            request_count = results[1]

            if request_count >= _MAX_REQUESTS:
                retry_after = int(_WINDOW_SECONDS - (now - window_start))
                logger.warning(
                    "Rate limit exceeded for %s (%d/%d in %ds)",
                    client_ip, request_count, _MAX_REQUESTS, _WINDOW_SECONDS,
                )
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please try again later."},
                    headers={
                        "Retry-After": str(max(1, retry_after)),
                        "X-RateLimit-Limit": str(_MAX_REQUESTS),
                        "X-RateLimit-Remaining": "0",
                    },
                )

            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(_MAX_REQUESTS)
            response.headers["X-RateLimit-Remaining"] = str(
                max(0, _MAX_REQUESTS - request_count - 1)
            )
            return response

        except Exception:
            # If Redis is down, allow the request through (fail-open)
            logger.debug("Rate limiter Redis unavailable — allowing request")
            return await call_next(request)
