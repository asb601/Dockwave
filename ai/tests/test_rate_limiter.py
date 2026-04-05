"""Tests for the rate limiter middleware."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from starlette.testclient import TestClient


@pytest.fixture
def test_app():
    """Create a minimal FastAPI app with rate limiter for testing."""
    from fastapi import FastAPI
    from app.middleware.rate_limiter import RateLimiterMiddleware

    app = FastAPI()
    app.add_middleware(RateLimiterMiddleware)

    @app.get("/test")
    async def test_endpoint():
        return {"ok": True}

    @app.get("/healthz")
    async def health():
        return {"status": "ok"}

    return app


class TestRateLimiter:
    def test_healthz_exempt(self, test_app):
        """Health endpoint should never be rate limited."""
        client = TestClient(test_app)
        for _ in range(50):
            resp = client.get("/healthz")
            assert resp.status_code == 200

    def test_rate_limit_headers_present(self, test_app):
        """Responses should include rate limit headers when Redis is available."""
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_pipe.execute.return_value = [None, 5, None, None]
        mock_redis.pipeline.return_value = mock_pipe

        with patch("app.services.memory._get_redis", return_value=mock_redis):
            client = TestClient(test_app)
            resp = client.get("/test")
            assert resp.status_code == 200

    def test_fail_open_without_redis(self, test_app):
        """If Redis is unavailable, requests should pass through."""
        with patch("app.services.memory._get_redis", side_effect=Exception("Redis down")):
            client = TestClient(test_app)
            resp = client.get("/test")
            # Should get 200, not 500 (fail-open)
            assert resp.status_code == 200
