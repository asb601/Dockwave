import os
from fastapi import Header, HTTPException
from typing import Optional


def verify_service_token(x_service_token: Optional[str] = Header(default=None, alias="x-service-token")):
    expected = os.getenv("SERVICE_TOKEN")
    if not expected:
        return  # No protection configured
    if x_service_token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True
