from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger("intellidoc.knowledge")


class KnowledgeLoader:
    def __init__(self, bucket: Optional[str] = None, prefix: Optional[str] = None):
        self.bucket = bucket or os.getenv("AWS_S3_BUCKET") or os.getenv("AWS_BUCKET_NAME")
        self.prefix = (prefix or os.getenv("S3_PROJECT_PREFIX") or "GRAPH-RAG").rstrip("/")
        self.s3 = boto3.client("s3")

    def _email_key(self, email: str) -> str:
        return "".join(c if c.isalnum() or c in [".", "_", "-", "@"] else "_" for c in email)

    def load(self, user_email: str) -> Dict[str, Any]:
        if not self.bucket:
            logger.warning("No S3 bucket configured for knowledge loading")
            return {}
        key = f"{self.prefix}/{self._email_key(user_email)}/knowledge.json"
        try:
            obj = self.s3.get_object(Bucket=self.bucket, Key=key)
            data = obj["Body"].read()
            return json.loads(data.decode("utf-8"))
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("NoSuchKey", "404"):
                logger.debug("Knowledge file not found for %s", user_email)
            else:
                logger.warning("S3 error loading knowledge for %s: %s", user_email, e)
            return {}
        except json.JSONDecodeError as e:
            logger.error("Corrupt knowledge JSON for %s: %s", user_email, e)
            return {}
        except Exception as e:
            logger.exception("Unexpected error loading knowledge for %s", user_email)
            return {}
