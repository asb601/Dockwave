# IntelliDoc — System Architecture

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            CLIENT (Browser)                             │
│                                                                         │
│   Next.js 15 ─ React 19 ─ TypeScript ─ Tailwind CSS 4                  │
│   Pages: Landing, Home, Chat, Folders, Calendar, Notes, Profile, Admin  │
│   Auth: NextAuth (GitHub + Google OAuth)                                │
│   Streaming: ReadableStream SSE consumer                                │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      NEXT.JS API LAYER (BFF)                            │
│                                                                         │
│   /api/chat/stream ──── SSE proxy ────────────┐                         │
│   /api/chat ──────────── REST proxy ──────────┤                         │
│   /api/user/upload ──── S3 + ingest trigger ──┤    ┌──────────────┐     │
│   /api/calendar/* ──── CRUD ──────────────────┤    │              │     │
│   /api/notes/* ─────── CRUD ──────────────────┤    │  PostgreSQL  │     │
│   /api/ai-actions/* ── internal (AI→DB) ──────┤    │  (Prisma)    │     │
│   /api/ai-access/* ─── admin workflow ────────┘    │              │     │
│                                                    └──────────────┘     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ HTTP + SERVICE_TOKEN
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     PYTHON AI BACKEND (FastAPI)                          │
│                                                                         │
│   /agent/stream ──── LangGraph agent ─── SSE response                   │
│   /agent/run ─────── LangGraph agent ─── JSON response                  │
│   /ingest/file ───── PDF → Chunk → Embed → Neo4j                       │
│   /delete/* ──────── Cleanup S3 + Neo4j                                 │
│   /usage/summary ─── LLM cost aggregation                               │
│   /kb/* ──────────── Knowledge graph queries                            │
│                                                                         │
│   Middleware: CORS → Logging → Rate Limiter → Error Handler             │
└──────┬──────────────┬──────────────┬───────────────┬────────────────────┘
       │              │              │               │
       ▼              ▼              ▼               ▼
   ┌────────┐   ┌──────────┐   ┌─────────┐   ┌───────────┐
   │ Neo4j  │   │  Redis   │   │  AWS S3  │   │ LLM APIs  │
   │  5.20  │   │  7       │   │          │   │           │
   │        │   │          │   │          │   │ Azure     │
   │ Vector │   │ Chat     │   │ PDF      │   │ OpenAI    │
   │ Index  │   │ Memory   │   │ Storage  │   │ Cohere    │
   │ Graph  │   │ Rate     │   │ Know-    │   │ Groq      │
   │ Entity │   │ Limits   │   │ ledge    │   │ (fallback)│
   │ Search │   │          │   │ Snaps    │   │           │
   └────────┘   └──────────┘   └─────────┘   └───────────┘
```

---

## Frontend Architecture

### Framework: Next.js 15 (App Router)

The frontend is a server-rendered React application with client-side interactivity where needed. Uses the App Router (`src/app/`) for file-based routing.

### Route Map

```
src/app/
├── page.tsx               # Landing page (public)
├── layout.tsx             # Root layout — fonts, theme, RouteChrome wrapper
├── globals.css            # Tailwind + custom styles
│
├── (auth)/login/          # OAuth login (GitHub + Google)
├── home/                  # Dashboard — folders, upload, chat link
├── chat/[sessionId]/      # AI chat with streaming
├── folders/               # File/folder browser
├── calendar/              # Calendar + task views
├── notes/                 # Markdown note editor
├── profile/               # User settings
├── admin/                 # Admin: AI access approval
├── ai-access/             # AI access request flow
│
└── api/
    ├── auth/[...nextauth] # NextAuth handler
    ├── chat/              # GET sessions, POST message, DELETE session
    ├── chat/stream/       # SSE proxy to FastAPI /agent/stream
    ├── user/upload        # File upload → S3 + ingest trigger
    ├── user/files-folders  # File/folder tree
    ├── user/folders       # Folder CRUD
    ├── calendar/events    # Calendar CRUD
    ├── notes              # Notes CRUD
    ├── ai-actions/        # Internal: AI→DB bridge (create-event, create-task, create-note, edit-note)
    └── ai-access/         # Access request + admin approval
```

### Key Components

| Component | Role |
|-----------|------|
| `RouteChrome` | App shell — sidebar + topbar on authenticated pages, landing nav on public pages |
| `ChatClient` | Full chat UI — SSE streaming, session sidebar, markdown rendering, references panel, typing indicator |
| `NotesClient` | Dual-pane markdown editor — sidebar list, formatting toolbar, live preview |
| `CalendarViews` | Week/month/year grid views for events |
| `HomeClient` | Dashboard — greeting, folder creation, file browser, upload, chat link |
| `AiAccessGate` | Access control modal — requests AI access, shows pending/approved states |
| `UploadSection` | File upload with folder destination picker |

### Auth Flow

```
Browser → /login → NextAuth → GitHub/Google OAuth → JWT issued → 30-day session
                                    │
                                    ▼
                              PrismaAdapter → PostgreSQL User + Account records
```

- JWT strategy (no server-side sessions)
- `session.user.id` and `session.user.provider` injected via callbacks
- All API routes check `getServerSession()` — unauthenticated requests get 401

### Streaming Architecture (Chat)

```
ChatClient.tsx                  Next.js API                     FastAPI
     │                              │                              │
     │  POST /api/chat/stream       │                              │
     │  {message, sessionId}        │                              │
     │ ─────────────────────────►   │  POST /agent/stream          │
     │                              │  {goal, user_email, ...}     │
     │                              │ ─────────────────────────►   │
     │                              │                              │ LangGraph runs
     │                              │                              │ node by node
     │                              │   SSE: data: {"type":"status","status":"Searching..."}
     │                              │ ◄─────────────────────────   │
     │   SSE: data: {"type":"status"│,"status":"Searching..."}     │
     │ ◄─────────────────────────   │                              │
     │                              │   SSE: data: {"type":"chunk","token":"The"}
     │                              │ ◄─────────────────────────   │
     │   SSE: data: {"type":"chunk" │,"token":"The"}               │
     │ ◄─────────────────────────   │                              │
     │                              │   (intercepts tokens,        │
     │   (updates message state     │    builds full answer         │
     │    progressively)            │    for DB persistence)        │
     │                              │                              │
     │                              │   SSE: data: {"type":"done"} │
     │                              │ ◄─────────────────────────   │
     │                              │   saves to ChatMessage table  │
     │   SSE: data: {"type":"done"} │                              │
     │ ◄─────────────────────────   │                              │
```

The Next.js layer is a **pass-through proxy** with one extra responsibility: it saves the final assembled answer to PostgreSQL so chat history persists across sessions.

---

## Database Architecture

### PostgreSQL (Prisma ORM)

Handles all structured application data — users, files, events, notes, chat history.

```
┌──────────┐
│   User   │──────┬──────────┬────────────┬────────────┬──────────────────┐
│ id       │      │          │            │            │                  │
│ email    │      │          │            │            │                  │
│ aiAccess │      ▼          ▼            ▼            ▼                  ▼
│          │  ┌────────┐ ┌────────┐ ┌───────────┐ ┌────────┐  ┌────────────────┐
└──────────┘  │ Folder │ │  File  │ │  Calendar │ │  Note  │  │  ChatSession   │
              │        │ │        │ │  Event    │ │        │  │                │
              │ name   │ │ name   │ │ title     │ │ title  │  │ title          │
              │parentId│ │ s3Key  │ │ start/end │ │content │  │lastMessageAt   │
              │        │ │folderId│ │ color     │ │deleted │  │                │
              └───┬────┘ └────────┘ │ deleted   │ └────────┘  └───────┬────────┘
                  │                 └─────┬─────┘                     │
                  │ self-ref              │                           │
                  ▼                       ▼                           ▼
              ┌────────┐            ┌──────────┐              ┌─────────────┐
              │children│            │   Task   │              │ ChatMessage │
              │Folder[]│            │ title    │              │ role        │
              └────────┘            │ priority │              │ content     │
                                    │ dueDate  │              │ sources     │
                                    │ dueTime  │              └─────────────┘
                                    │completed │
                                    │ deleted  │
                                    └──────────┘
```

Key design patterns:
- **Soft-delete** on CalendarEvent, Task, Note — `deleted: true` instead of row removal
- **Folder self-reference** — `parentId` for nested folders, `@@unique([userId, parentId, name])` prevents duplicates
- **Tasks belong to Events** — every task is attached to a calendar event (agent auto-creates a host event when needed)
- **Chat persistence** — sessions + messages stored for history across browser sessions
- **AI access control** — `aiAccess` boolean on User, admin approval via `AiAccessRequest` model

### Neo4j (Graph Database)

Handles document embeddings, text search, and entity relationships.

```
(User) ──OWNS──► (Folder) ──CONTAINS──► (File) ──HAS_CHUNK──► (Chunk)
  │                                                               │
  └──OWNS──► (File) [root files]                            MENTIONS
                                                                  │
                                                                  ▼
                                                             (Entity)
                                                          name, type,
                                                        normalizedName
```

**Three search indexes on Chunk:**

| Index | Type | Used By |
|-------|------|---------|
| `chunk_embedding_index` | Vector (cosine similarity) | VectorSearchTool |
| `chunk_fulltext` | Fulltext (Lucene) | GraphSearchTool |
| `entity_name_type` | Composite (name + type) | EntityGraphSearchTool |

Each Chunk stores: `text`, `parentText` (larger parent chunk for context), `page`, `charStart`, `charEnd`, `embedding` (1024-dim float array).

### Redis

- **Chat memory**: Per-session conversation history, keyed by `intellidoc:chat:{email}:{sessionId}`, max 10 messages, 24hr TTL
- **Rate limiting**: Sliding window counters per IP (ZSET-based), 30 requests per 60 seconds
- **Fail-open**: If Redis is down, chat memory falls back to in-memory dict, rate limiter allows all requests

### AWS S3

- **PDF storage**: Original uploaded files
- **Knowledge snapshots**: JSON dumps of user's knowledge graph structure (`{PREFIX}/{email}/knowledge.json`)

---

## Backend Architecture (FastAPI)

### Middleware Pipeline

Requests flow through 4 middleware layers (outermost first):

```
Request ──► CORS ──► Logging ──► Rate Limiter ──► Error Handler ──► Route Handler
                       │              │                  │
                       │              │                  └─ Catch-all: returns JSON
                       │              │                     with correlation ID
                       │              └─ Redis ZSET sliding window
                       │                 30 req/60s per IP
                       │                 Exempt: /healthz, /docs
                       └─ UUID correlation ID
                          Logs: method, path, status, latency
                          Returns: x-correlation-id header
```

### Service Token Auth

All backend endpoints require `x-service-token` header. The Next.js API layer attaches this when proxying requests. Uses constant-time HMAC comparison to prevent timing attacks.

```
Browser ──► Next.js API (NextAuth session check) ──► FastAPI (SERVICE_TOKEN check)
```

Two layers of auth: NextAuth for the user, SERVICE_TOKEN for service-to-service.

### Dependency Injection

```python
# container.py — singleton ToolRegistry
registry = ToolRegistry()
registry.register(VectorSearchTool(...))
        .register(GraphSearchTool(...))
        .register(EntityGraphSearchTool(...))
        .register(LLMTool(...))
        .register(GetMeetingsTool(...))
        .register(CreateEventTool(...))
        .register(CreateTaskTool(...))
        .register(CreateNoteTool(...))
        .register(EditNoteTool(...))
        .register(LLMRouterTool(...))
```

All tools are instantiated once at startup, connections shared across requests. The LangGraph agent receives the registry and pulls tools by name.

### LLM Provider Chain

Failover priority — if the first provider is unavailable, falls to the next:

```
Azure OpenAI (gpt-4o-mini)  ──►  OpenAI  ──►  Groq (primary model)  ──►  Groq (fallback model)
```

Plus a **circuit breaker** on the LLM tool: if a provider returns 429 (rate limited), it's cooled off for 30 seconds before retrying. Parses `Retry-After` headers.

### Observability

- **LangSmith tracing**: Every LangGraph node is decorated with `@traceable` — full trace of init → brain → tools → finalize visible in LangSmith dashboard
- **JSONL structured logs** (3 rotating files, 10MB max, 3 backups):
  - `events.jsonl` — search results, tool invocations, errors
  - `brain_event.jsonl` — agent decisions, tool calls, final answers
  - `llm_costs.jsonl` — per-call token usage and estimated USD cost
- **Usage endpoint**: `GET /usage/summary?period=today|7d|30d|all` — aggregates LLM spend by caller and model

---

## Infrastructure (Docker Compose)

```yaml
services:
  neo4j:    # Neo4j 5.20.0-community, ports 7474 + 7687, APOC plugins
  redis:    # Redis 7-alpine, port 6379, persistent volume

volumes:
  neo4j_data, neo4j_logs, neo4j_import, neo4j_plugins, redis_data
```

The Python backend and Next.js frontend run outside Docker (local dev with `uvicorn --reload` and `npm run dev`). Neo4j and Redis are containerized.

---

## Security

| Layer | Measure |
|-------|---------|
| Auth | OAuth only (no password storage), JWT sessions |
| API | Service token with HMAC constant-time comparison |
| Data isolation | All Neo4j queries filter by `userEmail`, Prisma queries filter by `userId` |
| Rate limiting | Redis sliding window, 30 req/60s per IP with fail-open |
| CORS | Explicit origin allowlist (no wildcard with credentials) |
| File upload | S3 pre-signed URLs, server-side validation |
| AI access | Admin approval required before using chat |
| Tool URLs | SSRF protection — scheme validation on all HTTP tool URLs |
| Soft-delete | Calendar events, tasks, notes — no accidental permanent deletion |
