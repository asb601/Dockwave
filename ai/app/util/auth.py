import logging
import os

from fastapi import Header, HTTPException
from typing import Optional

logger = logging.getLogger("intellidoc.auth")


def verify_service_token(x_service_token: Optional[str] = Header(default=None, alias="x-service-token")):
    expected = os.getenv("SERVICE_TOKEN")
    if not expected:
        logger.error("SERVICE_TOKEN not configured — rejecting request")
        raise HTTPException(status_code=500, detail="SERVICE_TOKEN not configured")
    if not x_service_token or x_service_token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True
