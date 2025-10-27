#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Create .venv if missing
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi

# Activate venv
source .venv/bin/activate

# Install deps
pip install --upgrade pip
pip install -r requirements.txt

# Run service
# Add the repo root to PYTHONPATH so `ai` is importable
export PYTHONPATH=$(pwd):$(dirname $(pwd))
uvicorn ai.app.main:app --reload --port 8000
