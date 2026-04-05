import hmac
import logging
import os
from typing import Optional

from fastapi import Header, HTTPException

logger = logging.getLogger("docwave.auth")


def verify_service_token(
    x_service_token: Optional[str] = Header(default=None, alias="x-service-token"),
) -> None:
    """Validate the service-to-service bearer token.

    Uses constant-time comparison (hmac.compare_digest) so that a timing
    oracle cannot be used to brute-force the token one character at a time.
    """
    expected = os.getenv("SERVICE_TOKEN", "")
    if not expected:
        logger.error("SERVICE_TOKEN not configured — all requests are rejected")
        raise HTTPException(status_code=503, detail="Service not configured")
    if not x_service_token:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    if not hmac.compare_digest(
        x_service_token.encode("utf-8"),
        expected.encode("utf-8"),
    ):
        raise HTTPException(status_code=401, detail="Invalid authentication token")
