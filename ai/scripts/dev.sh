#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Sync dependencies into a uv-managed virtualenv and run the API.
uv sync --python 3.12
uv run uvicorn app.main:app --reload --port 8000
