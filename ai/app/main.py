import logging
import os
import signal
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.middleware import ErrorHandlerMiddleware, LoggingMiddleware, RateLimiterMiddleware
from app.router.ingest import router as ingest_router
from app.router.knowledge import router as knowledge_router
from app.router.delete import router as delete_router
from app.router.usage import router as usage_router
from app.controllers.agent_controller import router as agent_router

# Load environment variables from ai/.env and override any stale shell exports.
load_dotenv(
    dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
    override=True,
)

# ---------------------------------------------------------------------------
# LangSmith observability – enable tracing when an API key is present
# ---------------------------------------------------------------------------
if os.getenv("LANGCHAIN_API_KEY"):
    os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    os.environ.setdefault("LANGCHAIN_PROJECT", "intellidoc")
    logging.getLogger("intellidoc.startup").info(
        "LangSmith tracing enabled (project=%s)", os.getenv("LANGCHAIN_PROJECT")
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
    # ── Graceful shutdown signal handling ──
    _shutting_down = False

    def _handle_signal(signum, frame):
        nonlocal _shutting_down
        if not _shutting_down:
            _shutting_down = True
            logger.info("Received signal %s — initiating graceful shutdown", signum)

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    # Startup: warm the registry and compile the LangGraph state machine
    # so the first real request pays no init cost.
    from app.core.container import get_registry
    try:
        registry = get_registry()
        logger.info("ToolRegistry initialised successfully")
    except Exception:
        logger.exception(
            "ToolRegistry initialisation failed — check environment variables"
        )
        registry = None

    if registry:
        try:
            from app.core.graph import get_agent_graph
            get_agent_graph(registry)
            logger.info("LangGraph agent graph compiled successfully")
        except Exception:
            logger.exception("LangGraph compilation failed")

    yield

    # ── Shutdown: drain connections gracefully ──
    logger.info("Shutting down — closing tool connections...")
    try:
        from app.core.container import get_registry
        for name, tool in get_registry().all().items():
            close = getattr(tool, "close", None)
            if callable(close):
                try:
                    close()
                    logger.debug("Closed tool: %s", name)
                except Exception:
                    logger.warning("Failed to close tool: %s", name, exc_info=True)
        logger.info("All tool connections closed")
    except Exception:
        pass

    try:
        from app.services.memory import close_redis
        close_redis()
        logger.info("Redis connection closed")
    except Exception:
        pass

    logger.info("Shutdown complete")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(title="IntelliDoc AI Service", version="1.0.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Middleware pipeline (order matters – outermost wraps innermost)
# ---------------------------------------------------------------------------
# 1. Error handler catches anything that bubbles up from below
app.add_middleware(ErrorHandlerMiddleware)
# 2. Rate limiter — reject excessive requests early
app.add_middleware(RateLimiterMiddleware)
# 3. Logging attaches correlation IDs and logs request/response timing
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
    """Liveness + dependency check.

    Returns HTTP 200 with component statuses. Individual component
    failures are reported but do not make the probe fail — this keeps
    the container alive while backends recover.
    """
    checks: dict = {"status": "ok"}

    # Neo4j
    try:
        from app.core.container import get_registry
        vtool = get_registry().get("vector_search")
        if vtool and hasattr(vtool, "_driver"):
            vtool._driver.verify_connectivity()
            checks["neo4j"] = "connected"
        else:
            checks["neo4j"] = "not_configured"
    except Exception as exc:
        checks["neo4j"] = f"error: {exc}"

    # Redis
    try:
        from app.services.memory import _get_redis
        r = _get_redis()
        r.ping()
        checks["redis"] = "connected"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    return checks


app.include_router(ingest_router, prefix="/ingest", tags=["ingest"])
app.include_router(knowledge_router, prefix="/kb", tags=["knowledge"])
app.include_router(delete_router, prefix="/delete", tags=["delete"])
app.include_router(agent_router, prefix="/agent", tags=["agent"])
app.include_router(usage_router, prefix="/usage", tags=["usage"])
