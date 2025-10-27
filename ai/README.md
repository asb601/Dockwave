# AI Service (FastAPI) – Design and Setup

This folder will host a Python FastAPI service that powers chat with context. It will run separately from Next.js and communicate via HTTP.

Key goals
- Expose /chat endpoint that accepts messages + context (entire, folder, file)
- Maintain embeddings and graph for each user’s files
- Ingest/update pipeline from Prisma-backed file system

Structure
- ai/app: FastAPI app package (routers, services, models)
- ai/tests: unit/integration tests
- ai/docs: extra docs, API contracts
- ai/scripts: local dev scripts (DB init, ingests)

See ai/docs/ARCHITECTURE.md for full workflow and production guidance.

## FastAPI skeleton quickstart (docs only)

- Create and activate venv:
  - python -m venv .venv && source .venv/bin/activate
- Install deps:
  - pip install fastapi uvicorn[standard]
- Run service:
  - uvicorn ai.app.main:app --reload --port 8000
- Health check: GET http://localhost:8000/healthz
- Chat stub: POST http://localhost:8000/chat
