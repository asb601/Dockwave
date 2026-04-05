# IntelliDoc — Project Overview

---

## What Is It

IntelliDoc is a full-stack document intelligence platform. You upload PDFs, and the system turns them into a searchable, queryable knowledge base — then lets you ask questions, create notes, schedule meetings, and manage tasks through a single AI chat interface.

It's not "upload a PDF and get a chatbot." It's a workspace where your documents become part of a larger productivity system — chat, calendar, notes, tasks — all connected through an AI agent that can reason across your files and take actions on your behalf.

---

## The Problem

Organizations and individuals store critical knowledge in PDFs — research papers, legal documents, technical manuals, lecture notes, compliance docs. Extracting answers means:

- Manually searching through hundreds of pages
- No way to ask cross-document questions ("what do papers A and B agree on?")
- Notes, schedules, and documents live in separate tools that don't talk to each other
- Generic chatbots either hallucinate facts or can't reason beyond what's in the text

IntelliDoc solves this by combining **document search**, **structured data tools**, and **an AI agent** that knows when to search your files vs when to just answer from its own knowledge — and is honest about which is which.

---

## Core Features

### 1. PDF Upload & Ingestion

Upload any PDF. The system automatically:
- Extracts text (with table/layout fallback for complex documents)
- Splits into semantically meaningful chunks (not fixed-size — grouped by meaning)
- Generates embeddings via Cohere embed-v4.0
- Stores everything in a Neo4j graph database with full hierarchy (User → Folder → File → Chunk)
- Extracts named entities (people, organizations, concepts) and links them across documents
- Creates a knowledge snapshot for fast retrieval

Organized in folders, just like a file system.

### 2. AI Chat with Streaming

A conversational AI agent that can:

- **Answer questions about your documents** — with citations (`[1, p.3]`) pointing to exact source passages
- **Answer general knowledge questions** — it's not limited to your files. It knows when to search and when to just answer.
- **Create notes** — "write up notes from chapter 3 of my ML paper" → searches docs first, then creates a formatted markdown note
- **Schedule meetings** — "schedule a team sync for tomorrow at 2pm" → creates a calendar event
- **Create tasks** — "remind me to review the contract by Friday" → creates a task with priority and due date
- **View your calendar** — "what do I have this week?"
- **Edit notes** — "update my project notes with the latest findings"

Real-time streaming — you see the response being generated token by token, with status indicators showing what the agent is doing ("Searching your documents...", "Creating note...").

### 3. Notes Editor

Full markdown notes with:
- Dual-pane editing (write on the left, preview on the right)
- Formatting toolbar (bold, italic, headings, lists, code blocks, links)
- Search across all notes
- Soft-delete for safety
- AI can create and edit notes directly from chat

### 4. Calendar & Tasks

- Week/month/year calendar views
- Create, edit, and delete events
- Tasks attached to calendar events with priority levels (Low/Medium/High) and due dates
- AI agent can create events and tasks through natural language
- Soft-delete pattern — nothing is permanently lost on accident

### 5. File Management

- Folder hierarchy with nested subfolders
- Upload files to specific folders
- Rename and delete folders
- Files stored in AWS S3, metadata in PostgreSQL, embeddings in Neo4j

### 6. AI Access Control

- Users must request AI chat access
- Admin approval workflow — admins can approve or deny requests
- Prevents uncontrolled LLM costs
- Email notifications for approvals

### 7. Authentication

- GitHub OAuth and Google OAuth via NextAuth
- JWT sessions (30-day expiry)
- User-scoped data — you only see your own files, notes, events
- Service token authentication between frontend and AI backend

---

## How It Works (User Perspective)

**Step 1: Upload**
Drop your PDFs into a folder. IntelliDoc processes them in the background — chunking, embedding, entity extraction. Takes seconds per document.

**Step 2: Ask**
Open the AI chat. Ask anything:
- "What are the key findings from my research paper?" → searches your docs, cites exact passages
- "Compare what Paper A and Paper B say about attention mechanisms" → cross-document search via entity graph
- "Write me study notes from chapter 4" → searches, then creates a formatted note
- "What's the capital of France?" → answers directly, no unnecessary document search
- "Schedule a meeting with the team for tomorrow at 3pm" → creates the event

**Step 3: Act**
The AI doesn't just answer — it takes action. Notes get created, meetings get scheduled, tasks get added to your calendar. Everything happens in one chat interface.

---

## What Makes It Different

### Not Just a Chat Wrapper

Most "chat with PDF" tools send your question + document to an LLM and return whatever it says. IntelliDoc runs a **multi-step agent loop** — the AI decides what tools to use, runs searches, evaluates results, and might search again if the first attempt wasn't good enough. It reasons, not just retrieves.

### Cross-Document Intelligence

Entity extraction + graph database means the system understands connections between your documents. If Person X is mentioned in Paper A and also in Paper B, the system knows that and can surface both when you ask about Person X — even if the papers use slightly different phrasing.

### Honest About Sources

The system is designed to never fabricate document content. When it uses your files, it quotes exactly and cites sources. When it uses general knowledge, it says so. If it's not sure, it tells you instead of making something up. A hallucination detection layer checks the answer against source chunks and flags anything suspicious.

### Productivity, Not Just Q&A

Chat + Notes + Calendar + Tasks in one system, all connected through the AI agent. Instead of copying an answer from a chatbot into your notes app, the AI creates the note for you — with proper markdown, sourced from your actual documents.

---

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| **Auth** | NextAuth (GitHub + Google OAuth), JWT sessions |
| **Database** | PostgreSQL (via Prisma ORM) |
| **Graph Database** | Neo4j 5 (vector index + fulltext + entity graph) |
| **File Storage** | AWS S3 |
| **AI Backend** | Python, FastAPI, LangGraph |
| **LLM** | Azure OpenAI (gpt-4o-mini), with OpenAI + Groq fallback |
| **Embeddings** | Cohere embed-v4.0 |
| **Reranking** | Cohere Rerank v3.5 |
| **Chat Memory** | Redis (per-session, 24hr TTL) |
| **Streaming** | Server-Sent Events (SSE) |
| **Observability** | LangSmith tracing, structured JSONL logging, LLM cost tracking |
