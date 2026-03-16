import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.middleware import ErrorHandlerMiddleware, LoggingMiddleware
from app.router.ingest import router as ingest_router
from app.router.knowledge import router as knowledge_router
from app.router.delete import router as delete_router
from app.controllers.agent_controller import router as agent_router

# Load environment variables from ai/.env (if present) before any module reads them
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

# ---------------------------------------------------------------------------
# Logging – configure once at startup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(title="IntelliDoc AI Service", version="1.0.0")

# ---------------------------------------------------------------------------
# Middleware pipeline (order matters – outermost wraps innermost)
# ---------------------------------------------------------------------------
# 1. Error handler catches anything that bubbles up from below
app.add_middleware(ErrorHandlerMiddleware)
# 2. Logging attaches correlation IDs and logs request/response timing
app.add_middleware(LoggingMiddleware)
# 3. CORS (standard FastAPI middleware)
_allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/healthz", tags=["health"])
async def healthz():
    return {"status": "ok"}


app.include_router(ingest_router, prefix="/ingest", tags=["ingest"])
app.include_router(knowledge_router, prefix="/kb", tags=["knowledge"])
app.include_router(delete_router, prefix="/delete", tags=["delete"])
app.include_router(agent_router, prefix="/agent", tags=["agent"])
