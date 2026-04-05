# Docwave — End-to-End Routes & Data Flows

---

## Architecture Overview

Docwave runs as two servers behind the browser:

```
┌──────────┐       ┌─────────────────────┐       ┌─────────────────────┐
│  Browser  │──────►│  Next.js :3000      │──────►│  FastAPI :8000      │
│           │       │  (frontend + API)   │       │  (AI + ingestion)   │
└──────────┘       └────────┬────────────┘       └────────┬────────────┘
                            │                             │
                       PostgreSQL                  Neo4j · Redis · S3
                      (Prisma ORM)              (graph, vectors, files,
                                                 embeddings, LLM APIs)
```

**Next.js** handles everything the user sees — pages, auth, file uploads, calendar, notes — and stores relational data in **PostgreSQL** via Prisma.

**FastAPI** handles everything AI — PDF ingestion, chunking, embedding, entity extraction, and the agentic RAG pipeline. It stores document graphs and vector embeddings in **Neo4j**, caches chat memory in **Redis**, and reads/writes PDFs + knowledge snapshots to **S3**.

The two servers talk over HTTP using a shared **SERVICE_TOKEN** (timing-safe comparison on both sides). The browser never hits FastAPI directly — Next.js proxies AI requests.

### Auth

- **Browser → Next.js**: NextAuth JWT cookie (GitHub / Google OAuth, 30-day expiry)
- **Next.js → FastAPI**: `x-service-token` header
- **AI access**: Users must be granted `aiAccess = true` by an admin before they can use the chat. Admins bypass this check.

---

## Next.js API Routes

### Auth

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET/POST | `/api/auth/[...nextauth]` | Public | NextAuth OAuth handler (GitHub + Google) |

### Chat

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/chat` | Session | List all chat sessions with messages |
| POST | `/api/chat` | Session + aiAccess | Send message (non-streaming, calls FastAPI `/agent/run`) |
| POST | `/api/chat/stream` | Session + aiAccess | Send message (SSE streaming, calls FastAPI `/agent/stream`) |
| DELETE | `/api/chat/:sessionId` | Session | Hard-delete a chat session + all messages |

### Files & Folders

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/user/upload` | Session | Upload file to S3, create DB record, fire-and-forget ingest to FastAPI |
| GET | `/api/user/files-folders` | Session | Get user's full file + folder tree |
| POST | `/api/user/folders` | Session | Create a folder |

### Calendar & Tasks

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/calendar/events?start=&end=` | Session | List events in date range |
| POST | `/api/calendar/events` | Session | Create event (with optional inline tasks) |
| PATCH | `/api/calendar/events` | Session | Update event |
| DELETE | `/api/calendar/events?id=` | Session | Soft-delete event |
| GET | `/api/calendar/events/eventsALL?start=&end=` | Dual (Session or SERVICE_TOKEN) | Events for browser or AI agent |

### Notes

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/notes` | Session | List all non-deleted notes |
| POST | `/api/notes` | Session | Create note |
| PATCH | `/api/notes` | Session | Update note |
| DELETE | `/api/notes?id=` | Session | Soft-delete note |

### AI Access Control

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/ai-access/request` | Session | Check user's AI access status |
| POST | `/api/ai-access/request` | Session | Request AI chat access (sends email to admin) |
| GET | `/api/ai-access/approve?token=` | Admin session | Approve request via email link |
| GET | `/api/ai-access/admin/requests` | Admin | List all access requests |
| POST | `/api/ai-access/admin/requests` | Admin | Approve or deny a request |

### AI Action Endpoints (internal, called by Python agent)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/ai-actions/create-event` | SERVICE_TOKEN | Create calendar event for a user |
| POST | `/api/ai-actions/create-task` | SERVICE_TOKEN | Create task on an event |
| POST | `/api/ai-actions/create-note` | SERVICE_TOKEN | Create note for a user |
| PATCH | `/api/ai-actions/edit-note` | SERVICE_TOKEN | Edit an existing note |
| GET | `/api/ai-actions/edit-note?user_email=` | SERVICE_TOKEN | List user's notes (so agent can pick which to edit) |

---

## FastAPI Routes

### AI Agent

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/agent/run` | SERVICE_TOKEN | Run full LangGraph agent pipeline, return JSON result |
| POST | `/agent/stream` | SERVICE_TOKEN | Run agent with SSE streaming (status → chunks → sources → done) |

### Ingestion & Deletion

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/ingest/file` | SERVICE_TOKEN | Extract text, chunk, embed, store in Neo4j, extract entities |
| POST | `/delete/file` | SERVICE_TOKEN | Delete file from S3 + Neo4j, re-snapshot knowledge |
| POST | `/delete/folder` | SERVICE_TOKEN | Delete folder + all files from S3 + Neo4j |

### Knowledge & Usage

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/knowledge/user/:user_id` | SERVICE_TOKEN | Get user's document knowledge graph |
| GET | `/usage/summary?period=` | SERVICE_TOKEN | LLM cost aggregation (today, 7d, 30d, all) |
| GET | `/healthz` | None | Liveness check (Neo4j + Redis connectivity) |

---

## Key Data Flows

### Chat (streaming)

Browser → `POST /api/chat/stream` → Next.js saves user message to PostgreSQL → proxies to FastAPI `/agent/stream` → LangGraph runs (init → brain ↔ tools → finalize) → SSE tokens stream back through Next.js → browser renders progressively → Next.js saves assistant message on stream end.

### File Upload

Browser → `POST /api/user/upload` → Next.js uploads to S3 + creates DB record → fire-and-forget `POST /ingest/file` to FastAPI → FastAPI extracts text, chunks, embeds, stores in Neo4j, snapshots knowledge to S3 → entity extraction runs as background task.

### AI Actions

User asks "schedule a meeting" in chat → brain LLM calls `schedule_meeting` tool → FastAPI `POST /api/ai-actions/create-event` on Next.js → Prisma creates event in PostgreSQL → result returned to brain → brain responds to user. Same pattern for notes and tasks.

### AI Access Approval

User requests access → Next.js creates pending request + emails admin → admin clicks link → `GET /api/ai-access/approve?token=` → transaction: mark approved + set `user.aiAccess = true` → user can now use chat.
