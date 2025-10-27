from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from .router.ingest import router as ingest_router
from .router.knowledge import router as knowledge_router
from .router.delete import router as delete_router
from .controllers.agent_controller import router as agent_router

# Load environment variables from ai/.env if present
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

app = FastAPI(title="Graph RAG AI Service", version="0.1.0")

# Allow local dev origins by default
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

app.include_router(ingest_router, prefix="/ingest", tags=["ingest"]) 
app.include_router(knowledge_router, prefix="/kb", tags=["knowledge"]) 
app.include_router(delete_router, prefix="/delete", tags=["delete"])
app.include_router(agent_router, prefix="/agent", tags=["agent"])
