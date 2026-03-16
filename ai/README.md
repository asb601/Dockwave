# IntelliDoc AI Service

A FastAPI backend that powers intelligent document Q&A using **Multi-Agent Graph-RAG** — combining vector search, graph database queries, and LLM synthesis to answer questions grounded in your uploaded documents and calendar events.

---

## Key Concepts

### 1. Graph-RAG (Retrieval-Augmented Generation)

Unlike plain RAG that only does vector similarity search, Graph-RAG stores documents in a **Neo4j graph** with a structured hierarchy:

```
User
 ├─ OWNS → Folder
 │          └─ CONTAINS → File
 │              └─ HAS_CHUNK → Chunk (text + embedding + char offsets)
 └─ OWNS → File (root-level files)
```

Queries hit **two retrieval paths** in parallel — vector index search (semantic similarity via Cohere embeddings) and graph text search (keyword CONTAINS) — then merge results for better recall.

### 2. Brain Agent (Iterative Retrieval)

The core orchestrator that doesn't just search once — it runs an **iterative loop (up to 4 passes)**:

- **Pass 1:** Search with the raw question
- **Pass 2:** Add file/folder cues from the knowledge base
- **Pass 3+:** Generate contextual query variants

Each pass collects more chunks. After every pass, it checks a **confidence score** (threshold: 0.30). Once confident enough or out of iterations, it hands the top chunks to the LLM for synthesis.

### 3. Hybrid Reranking (Reciprocal Rank Fusion)

Results from vector search and graph search are merged using **RRF** — a technique that combines rankings from multiple sources without needing comparable scores. On top of that, a **lexical bonus** (+0.02 per query token found in the chunk, capped at 0.2) rewards chunks that literally contain the question terms. Duplicates are removed by (file, text prefix).

### 4. Evidence Grounding

Every answer gets an **evidence score** — the fraction of answer tokens that appear in the source chunks. If the score is >= 0.20, the answer is marked `"grounded"`; otherwise `"generalized"`. This tells the frontend how trustworthy the answer is.

### 5. Tool Registry & Orchestrator

A pluggable **protocol-based tool system**. Any object with a `name`, `description`, and async `run()` method can be registered as a tool:

| Tool | Purpose |
|------|---------|
| `vector_search` | Cohere embedding → Neo4j vector index (top 15 results) |
| `graph_search` | Text CONTAINS query on Neo4j (top 10 results) |
| `llm_summarize` | GPT-4o-mini synthesis with source chunks |
| `llm_router` | Routes questions to the right tool/pipeline |
| `get_meetings` | Fetches calendar events from the Next.js backend |

The **AgentOrchestrator** asks the LLM router which tools to invoke, then executes them.

### 6. Dynamic Chunking

Documents are split into chunks targeting **~600 tokens (~2,400 chars)** with sizes clamped between 1,200-3,500 chars based on document length, and **15% overlap** between consecutive chunks to preserve context at boundaries.

### 7. Knowledge Snapshots

After ingestion, a `knowledge.json` is generated and stored on S3 containing the user's full file/folder structure. This snapshot is loaded during queries so the Brain Agent can suggest file-specific search variants without hitting the database.

### 8. Dependency Injection Container

A singleton `Container` builds the `ToolRegistry` once at startup, wiring all tools with Neo4j credentials and API keys from environment variables. Every request gets the same registry instance — no repeated connection overhead.

---

## Architecture

```
┌─────────────┐     POST /agent/run     ┌──────────────────┐
│   Next.js   │ ──────────────────────►  │   BrainAgent     │
│   Frontend  │                          │  (iterative RAG) │
└─────────────┘                          └────────┬─────────┘
                                                  │
                                    ┌─────────────┼──────────────┐
                                    ▼             ▼              ▼
                              ┌──────────┐ ┌───────────┐ ┌────────────┐
                              │ Vector   │ │  Graph    │ │    LLM     │
                              │ Search   │ │  Search   │ │ Summarize  │
                              │ (Cohere) │ │ (Neo4j)   │ │ (GPT-4o)   │
                              └────┬─────┘ └─────┬─────┘ └────────────┘
                                   │             │
                                   ▼             ▼
                              ┌──────────────────────┐
                              │   Hybrid Reranker    │
                              │   (RRF + lexical)    │
                              └──────────────────────┘
```

---

## Project Structure

```
ai/
├── app/
│   ├── main.py              # FastAPI app, middleware, startup
│   ├── agents/
│   │   ├── brain.py          # Brain agent — iterative RAG orchestration
│   │   ├── knowledge.py      # Knowledge base helpers
│   │   ├── rerank.py         # Hybrid RRF reranking
│   │   └── tools.py          # Tool implementations (vector, graph, LLM, meetings)
│   ├── controllers/
│   │   └── agent_controller.py  # Request → BrainAgent → Response
│   ├── core/
│   │   ├── container.py      # DI container (singleton ToolRegistry)
│   │   ├── orchestrator.py   # Tool execution engine
│   │   └── tool_registry.py  # Protocol-based tool registry
│   ├── middleware/
│   │   ├── error_handler.py  # Global exception → JSON error + correlation ID
│   │   └── logging_middleware.py  # Request/response logging with latency
│   ├── router/
│   │   ├── ingest.py         # POST /ingest/file
│   │   ├── knowledge.py      # GET /kb/user/{user_id}
│   │   └── delete.py         # POST /delete/file
│   ├── services/
│   │   ├── ingest_service.py # Full ingestion pipeline
│   │   ├── vectors.py        # Neo4j vector/graph operations
│   │   ├── graph.py          # Graph query helpers
│   │   ├── knowledge_service.py  # Knowledge snapshot management
│   │   └── pdf_extract.py    # PDF text extraction (pypdf)
│   └── util/
│       ├── auth.py           # SERVICE_TOKEN verification
│       ├── log.py            # JSONL event logging
│       └── prompts.py        # LLM prompt templates
├── docs/                     # Golden queries for testing
├── logs/                     # JSONL event logs (auto-generated)
├── scripts/
│   ├── dev.sh                # Local dev startup
│   └── repo_inventory.py     # Repo structure scanner
├── docker-compose.yml        # Neo4j container setup
└── requirements.txt          # Python dependencies
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/agent/run` | None | Run the Brain Agent on a question |
| `POST` | `/ingest/file` | `x-service-token` | Ingest a PDF from S3 into Neo4j |
| `GET` | `/kb/user/{user_id}` | `x-service-token` | Fetch user's knowledge structure |
| `POST` | `/delete/file` | `x-service-token` | Delete a file from S3 + Neo4j |
| `GET` | `/healthz` | None | Health check |

### Example: Ask a question

```bash
curl -X POST http://localhost:8000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"goal": "What is the refund policy?", "user_email": "user@example.com"}'
```

Response includes: `goal`, `answer`, `graph_rag_result` (chunks + scores + status), `meetings_result`, `scratchpad` (iteration trace), and timing metrics.

---

## Data Pipelines

### Ingestion Pipeline

```
PDF on S3
  → Extract text (pypdf)
  → Dynamic chunking (~600 tokens, 15% overlap)
  → Embed via Cohere (embed-v4.0)
  → Store in Neo4j (User → Folder → File → Chunk graph)
  → Create vector index on Chunk.embedding
  → Snapshot knowledge.json to S3
```

### Query Pipeline

```
User question
  → LLM Router (decide: graph_rag or get_meetings)
  → Iterative search loop (up to 4 passes):
      → Generate query variants
      → Vector search + Graph search (parallel)
      → Hybrid RRF reranking + dedup
      → Check confidence (>= 0.30 → stop)
  → LLM synthesis with top 15 chunks
  → Evidence grounding score
  → Return answer + citations + status
```

---

## External Dependencies

| Service | Purpose | Details |
|---------|---------|---------|
| **Neo4j 5.20** | Graph DB + vector index | Stores documents, chunks, embeddings |
| **Cohere API** | Text embeddings | embed-v4.0 (ingestion), embed-english-v3.0 (search) |
| **Azure OpenAI** | LLM (GPT-4o-mini) | Routing, summarization, date parsing |
| **AWS S3** | Object storage | PDFs, knowledge snapshots |
| **Next.js App** | Calendar API | Fetches user events/tasks |

---

## Setup

### Prerequisites

- Python 3.11+
- Neo4j 5.20+ (or use `docker-compose up -d`)
- Cohere API key
- Azure OpenAI or OpenAI API key
- AWS credentials (S3 access)

### Quickstart

```bash
# 1. Start Neo4j
docker-compose up -d

# 2. Create and activate virtualenv
python -m venv .venv && source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set environment variables (see below)
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=your-password
export AZURE_OPENAI_API_KEY=your-key
export AZURE_OPENAI_API_BASE=https://your-endpoint.openai.azure.com
export embeedings_api=your-cohere-key
export AWS_S3_BUCKET=your-bucket
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret

# 5. Run the service
uvicorn app.main:app --reload --port 8000

# 6. Verify
curl http://localhost:8000/healthz
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j connection URI |
| `NEO4J_USERNAME` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `please-change-me` | Neo4j password |
| `AZURE_OPENAI_API_KEY` | — | Azure OpenAI API key |
| `AZURE_OPENAI_API_BASE` | — | Azure OpenAI endpoint |
| `AZURE_OPENAI_MODEL` | `gpt-4o-mini` | LLM deployment name |
| `embeedings_api` | — | Cohere API key |
| `AWS_S3_BUCKET` | — | S3 bucket for document storage |
| `AWS_ACCESS_KEY_ID` | — | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | — | AWS secret key |
| `SERVICE_TOKEN` | — | Auth token for protected routes (optional) |
| `NEXT_API_BASE` | `http://localhost:3000` | Next.js app URL (calendar API) |
| `S3_PROJECT_PREFIX` | `GRAPH-RAG` | S3 path prefix for snapshots |

### Tuning Parameters

| Variable | Default | Description |
|----------|---------|-------------|
| `CONFIDENCE_SUMMARIZE` | `0.30` | Min rerank confidence to stop iterating |
| `CONFIDENCE_PLANNER` | `0.15` | Router confidence threshold |
| `MIN_HITS` | `6` | Min chunks required before answering |
| `MIN_EVIDENCE` | `0.20` | Min evidence score for "grounded" status |

---

## Observability

All operations are logged as **JSONL events** to `logs/events.jsonl` and `logs/brain_event.jsonl`:

- `tool.invoke` — tool calls with args and results
- `llm.call` — LLM requests with token counts and estimated cost
- `iteration.eval` — per-iteration confidence and chunk counts
- `answer.eval` — final answer evidence score and grounding status
- `tool.error` — tool failures

Each request gets a correlation ID (`X-Correlation-ID` header) for tracing across logs.
