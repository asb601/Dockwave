import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.middleware import ErrorHandlerMiddleware, LoggingMiddleware
from app.router.ingest import router as ingest_router
from app.router.knowledge import router as knowledge_router
from app.router.delete import router as delete_router
from app.controllers.agent_controller import router as agent_router

# Load environment variables from ai/.env and override any stale shell exports.
load_dotenv(
    dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
    override=True,
)

# ---------------------------------------------------------------------------
# Logging – configure once at startup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

logger = logging.getLogger("intellidoc.startup")


# ---------------------------------------------------------------------------
# Lifespan – startup & shutdown hooks
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: warm the registry so the first real request pays no init cost.
    try:
        from app.core.container import get_registry
        get_registry()
        logger.info("ToolRegistry initialised successfully")
    except Exception:
        logger.exception(
            "ToolRegistry initialisation failed — check environment variables"
        )

    yield

    # Shutdown: close any persistent connections held by tools.
    try:
        from app.core.container import get_registry
        registry = get_registry()
        for tool in registry.all().values():
            close = getattr(tool, "close", None)
            if callable(close):
                try:
                    close()
                except Exception:
                    pass
        logger.info("All tool connections closed")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(title="IntelliDoc AI Service", version="1.0.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Middleware pipeline (order matters – outermost wraps innermost)
# ---------------------------------------------------------------------------
# 1. Error handler catches anything that bubbles up from below
app.add_middleware(ErrorHandlerMiddleware)
# 2. Logging attaches correlation IDs and logs request/response timing
app.add_middleware(LoggingMiddleware)
# 3. CORS
_allowed_origins = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    # Explicit allowlist — never use "*" with credentials
    allow_headers=["Content-Type", "x-service-token", "x-correlation-id"],
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
