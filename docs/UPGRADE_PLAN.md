# Docwave — 2026 Production Upgrade Plan

> **Current rating: 5/10** — The bones are solid (LangGraph state machine, triple-search retrieval,
> Cohere rerank, entity graph), but execution is stuck in 2023 patterns: character-based chunking,
> no user isolation, fake streaming, zero tests, no observability, silent failures everywhere.
>
> **Target: 9/10** — Production-grade RAG with proper LangChain document processing, real token
> streaming, LangSmith observability, user-scoped retrieval, retry logic, and comprehensive tests.

---

## Improvement Tracker

| # | Area | Improvement | Severity | Status |
|---|---|---|---|---|
| 1 | **Chunking** | Replace custom `dynamic_chunk()` with LangChain `RecursiveCharacterTextSplitter` (token-based, 400 tokens, 50-token overlap) | Critical | ✅ |
| 2 | **Chunking** | Add parent-document strategy — store small chunks for retrieval + large chunks for synthesis | High | ⬜ |
| 3 | **Chunking** | Preserve document structure (headers, tables, paragraphs) using LangChain `MarkdownHeaderTextSplitter` or `HTMLSectionSplitter` after conversion | High | ⬜ |
| 4 | **Embedding** | Add batch-size guard (max 96 texts per Cohere API call) with retry | Critical | ✅ |
| 5 | **Embedding** | Switch from raw `requests.post` to `langchain-cohere` `CohereEmbeddings` with built-in batching and retry | High | ⬜ |
| 6 | **Security** | Add `user_id` filter to ALL Neo4j search queries (vector, fulltext, entity graph) — users must only see their own documents | Critical | ✅ |
| 7 | **Security** | Generate strong `SERVICE_TOKEN` and rotate all exposed secrets | Critical | ⬜ |
| 8 | **Security** | Fix `/api/ai-access/approve` — require admin session auth, not just token | Critical | ✅ |
| 9 | **Security** | Fix `/api/calendar/events/eventsALL` — always require userId filter | Critical | ✅ |
| 10 | **Security** | Use `crypto.timingSafeEqual` for service token comparison in Next.js routes | High | ✅ |
| 11 | **Streaming** | Replace fake 20-char chunking with real LLM token streaming using `stream=True` in the OpenAI-compatible API call | High | ✅ |
| 12 | **Streaming** | Fix SSE parsing — use a proper line-buffered SSE parser that handles events split across TCP chunks | High | ✅ |
| 13 | **Observability** | Configure LangSmith properly — set `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT`, verify traces appear in dashboard | High | ⬜ |
| 14 | **Observability** | Add structured logging with `structlog` — replace raw `logging.info()` calls with JSON-structured events | Medium | ⬜ |
| 15 | **Observability** | Add latency metrics per node (route, search, rerank, synthesize) — log timing breakdowns | Medium | ⬜ |
| 16 | **Error Handling** | Add `tenacity` retry with exponential backoff to Cohere embed, Cohere rerank, Neo4j queries, S3 operations | High | ✅ |
| 17 | **Error Handling** | Replace bare `except: pass` on Neo4j index creation with proper error logging and startup health check | High | ✅ |
| 18 | **Error Handling** | Distinguish "no results found" from "search backend failed" — surface errors to the user instead of false "document not found" | Medium | ✅ |
| 19 | **Memory** | Configure Redis properly (set `REDIS_URL`) or switch to PostgreSQL-backed memory via the existing Prisma `ChatMessage` table | High | ⬜ |
| 20 | **Memory** | Add session-to-user ownership validation — prevent session_id hijacking | High | ✅ |
| 21 | **Entity Extraction** | Add spaCy NER as the primary extractor (fast, free, local) and use LLM only for complex/ambiguous entities | High | ⬜ |
| 22 | **Retrieval** | Fix confidence scoring — separate RRF scores from Cohere rerank scores, use only rerank scores for threshold | High | ✅ |
| 23 | **Retrieval** | Add query decomposition — for complex multi-hop questions, split into sub-queries and merge results | Medium | ⬜ |
| 24 | **Retrieval** | Deduplicate collected chunks across retry iterations before RRF | Medium | ✅ |
| 25 | **LLM** | Remove duplicate citation-context building — build it once in `synthesize_node`, pass pre-built context to `LLMTool.run()` | Medium | ✅ |
| 26 | **Code Quality** | Delete dead code: `vectors.py`, `orchestrator.py` stub, `brain.py` stub, unused `cohere`/`numpy` deps | Medium | ✅ |
| 27 | **Code Quality** | Add `pytest` + `pytest-asyncio` with unit tests for chunking, reranking, entity extraction, and graph routing | High | ⬜ |
| 28 | **Code Quality** | Add `ruff` linter + formatter, `mypy` strict mode, pre-commit hooks | Medium | ⬜ |
| 29 | **Frontend** | Add rate limiting middleware (e.g., `@upstash/ratelimit`) to chat and upload endpoints | High | ⬜ |
| 30 | **Frontend** | Add file upload validation — max size (10MB), allowed MIME types (PDF, DOCX, TXT) | High | ✅ |
| 31 | **Frontend** | Add pagination to chat history GET — load sessions list without messages, lazy-load messages on select | Medium | ⬜ |
| 32 | **Frontend** | Fix Prisma connection leak in dev — use `globalThis.__prisma` singleton pattern | Medium | ✅ |
| 33 | **PDF Processing** | Add OCR support for scanned PDFs using `pytesseract` + `pdf2image` (already in requirements.txt comments) | Medium | ⬜ |
| 34 | **PDF Processing** | Add DOCX/TXT/MD support — not just PDFs | Low | ⬜ |
| 35 | **Infra** | Add Docker Compose health checks for Neo4j, Redis, and the AI backend | Medium | ✅ |
| 36 | **Infra** | Pin all dependency versions in `pyproject.toml` (e.g., `langgraph==1.1.3` not `>=1.1.3`) | Medium | ⬜ |
| 37 | **Evaluation** | Build golden query set (50+ Q&A pairs) and measure RAGAS metrics (Faithfulness, Context Precision, Answer Relevancy) | High | ⬜ |
| 38 | **Evaluation** | Set up automated eval runs — every change must not regress accuracy below baseline | Medium | ⬜ |
| 39 | **Retrieval** | Implement HyDE (Hypothetical Document Embeddings) — LLM generates hypothetical answer, embed that for search | Medium | ⬜ |
| 40 | **Retrieval** | Add contextual compression — after retrieval, extract only relevant sentences from each chunk before synthesis | Medium | ⬜ |
| 41 | **API** | Add `/health` endpoint with dependency checks (Neo4j, Redis, Cohere, LLM reachability) | High | ✅ |
| 42 | **Infra** | Add CI/CD pipeline — GitHub Actions for lint + test + deploy | Medium | ⬜ |
| 43 | **Frontend** | Add error boundaries and loading states per component | Low | ⬜ |
| 44 | **Retrieval** | Add MMR (Maximal Marginal Relevance) to reduce redundancy in retrieved chunks | Medium | ⬜ |
| 45 | **Chunking** | Add metadata enrichment — attach section headers, document title as metadata to each chunk for better context | Medium | ⬜ |
| 46 | **LLM** | Add output guardrails — validate LLM output format, detect hallucination patterns, filter toxic content | Medium | ⬜ |
| 47 | **LLM** | Add LLM fallback chain — if Groq fails, automatically try Azure OpenAI, then OpenAI | High | ✅ |
| 48 | **Memory** | Add conversation summarization for long sessions to stay within context window | Medium | ⬜ |
| 49 | **Retrieval** | Add self-query retrieval — LLM extracts metadata filters (file name, date range, topic) from user question | Medium | ⬜ |
| 50 | **Security** | Add API rate limiting via Redis sliding window on both backend and frontend | High | ⬜ |
| 51 | **Infra** | Add graceful shutdown handling — drain connections, flush logs, close Redis/Neo4j cleanly | Medium | ⬜ |
| 52 | **Observability** | Add OpenTelemetry traces — propagate trace IDs from Next.js → FastAPI → Neo4j → Cohere for end-to-end tracing | Medium | ⬜ |
| 53 | **Chunking** | Add semantic chunking — use embedding similarity to find natural topic boundaries instead of fixed windows | High | ⬜ |

---

## Detailed Explanations

### 1. Replace `dynamic_chunk()` with LangChain Token-Based Splitting (CRITICAL)

**Current problem:**
```python
# ingest_service.py — current code
def dynamic_chunk(text: str) -> List[str]:
    size = max(2000, int(length / 2) or 1500)  # CHARACTER count
    clean = " ".join(text.split())               # destroys ALL structure
```

This is the #1 reason your accuracy is poor. Two fatal flaws:
- **Character-based sizing.** Cohere embed-v4.0 takes ~512 tokens. Your chunks can be 5,000 chars (~1,250 tokens) — **2.5x the model's input limit.** The embedding API silently truncates, so the last 60% of every large chunk is never embedded. Retrieval can't find information that was never embedded.
- **`" ".join(text.split())`** collapses all paragraph breaks, table formatting, and section headers into one flat string. A chunk boundary can split mid-sentence or mid-table-row.

**Fix — LangChain `RecursiveCharacterTextSplitter` with tiktoken:**
```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    model_name="gpt-4",          # tiktoken encoding (cl100k_base)
    chunk_size=400,               # 400 TOKENS — well within embed-v4.0's 512 limit
    chunk_overlap=50,             # 50 token overlap for context continuity
    separators=["\n\n", "\n", ". ", " "],  # split at paragraphs first, then sentences
)
chunks = splitter.split_text(extracted_text)
```

**Why this matters for accuracy:**
- Every chunk fits within the embedding model's window — no silent truncation
- Paragraph/sentence boundaries are respected — no mid-sentence splits
- Token-based math guarantees predictable behavior across languages and special characters

---

### 2. Parent-Document Strategy (HIGH)

**Current problem:** You store one chunk size for both retrieval and synthesis. Small chunks are better for retrieval (more precise matching), but large chunks are better for synthesis (more context for the LLM).

**Fix:** Store chunks at two granularities:
- **Child chunks** (200 tokens) — used for vector search, these give precise hits
- **Parent chunks** (800 tokens) — stored with a `parent_id` link, these are sent to the LLM

When vector search finds a child chunk, you expand to its parent for synthesis. This is a standard LangChain pattern:

```python
from langchain.retrievers import ParentDocumentRetriever
from langchain_text_splitters import RecursiveCharacterTextSplitter

child_splitter = RecursiveCharacterTextSplitter(chunk_size=200)
parent_splitter = RecursiveCharacterTextSplitter(chunk_size=800)
```

In your Neo4j model, this means adding a `(:Chunk)-[:CHILD_OF]->(:ParentChunk)` relationship.

---

### 3. Preserve Document Structure (HIGH)

**Current problem:** `pdf_extract.py` extracts raw text. Section headers, table structure, and metadata are lost before chunking.

**Fix:** Convert PDF → Markdown first using a layout-aware parser, then use `MarkdownHeaderTextSplitter`:

```python
from langchain_text_splitters import MarkdownHeaderTextSplitter

headers = [("#", "Section"), ("##", "Subsection")]
md_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers)
splits = md_splitter.split_text(markdown_text)
# Each split has metadata: {"Section": "Introduction", "Subsection": "Background"}
```

This preserves structural context so the LLM knows which section a chunk came from.

---

### 4–5. Fix Embedding Pipeline (CRITICAL + HIGH)

**Current problem:**
```python
# ingest_service.py — current code
resp = requests.post("https://api.cohere.com/v2/embed", json={"texts": chunks, ...})
```

Raw HTTP call, no batch limit (Cohere max = 96 texts), no retry, synchronous.

**Fix — Use `langchain-cohere` embeddings:**
```python
from langchain_cohere import CohereEmbeddings

embeddings = CohereEmbeddings(
    model="embed-v4.0",
    cohere_api_key=os.getenv("COHERE_API_KEY"),
)
# Built-in batching, retry, async support
vectors = await embeddings.aembed_documents(chunk_texts)
```

LangChain's `CohereEmbeddings` handles:
- Automatic batching (respects API limits)
- Automatic retry with exponential backoff
- Async support (`aembed_documents`)
- Proper `input_type` switching (`search_document` vs `search_query`)

---

### 6. User-Scoped Search (CRITICAL)

**Current problem:** Every search query returns chunks from ALL users. User A can ask a question and get User B's confidential document content in the answer.

**Current Cypher (tools.py):**
```cypher
CALL db.index.vector.queryNodes('chunk_embedding_index', $k, $embedding)
YIELD node, score
RETURN node.text AS text, node.file AS file, node.page AS page, score
```

No `WHERE node.userId = $userId` — returns everything.

**Fix — Add userId filter to every search:**
```cypher
CALL db.index.vector.queryNodes('chunk_embedding_index', $k, $embedding)
YIELD node, score
WHERE node.userId = $userId
RETURN node.text AS text, node.file AS file, node.page AS page, score
```

Same fix needed in fulltext search and entity graph traversal. The `userId` must be stored on every `Chunk` node at ingest time and filtered at query time.

---

### 7. Rotate Secrets (CRITICAL)

Your `.env` was shared in chat. Even if it wasn't committed to git, these need immediate rotation:
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
- `COHERE_API_KEY`
- `GROQ_API_KEY`
- `NEO4J_PASSWORD`
- `DATABASE_URL` (Neon DB password)
- `GITHUB_SECRET` / `GOOGLE_CLIENT_SECRET`
- `EMAIL_SERVER_PASSWORD`
- `NEXTAUTH_SECRET`

Generate a new `SERVICE_TOKEN`:
```bash
openssl rand -base64 32
```

---

### 11. Real LLM Token Streaming (HIGH)

**Current problem (agent_controller.py):**
```python
# Runs the FULL pipeline, waits for complete answer...
result = await run_agent_graph(registry, goal=req.goal, ...)

# ...then fakes streaming by slicing the finished string:
for i in range(0, len(answer), 20):
    yield _sse("chunk", {"token": answer[i:i + 20]})
    await asyncio.sleep(0.01)
```

This is not streaming. The user waits the full 3–8 seconds for the LLM to finish, THEN sees text appear in 20-char bursts. Real streaming means tokens appear as the LLM generates them.

**Fix — Pass `stream=True` to the LLM call:**
```python
# In LLMTool.run() or a new LLMTool.stream() method:
response = client.chat.completions.create(
    model=deployment,
    messages=messages,
    temperature=0.1,
    max_tokens=1024,
    stream=True,  # ← real token streaming
)
for chunk in response:
    token = chunk.choices[0].delta.content or ""
    yield token
```

Then in `synthesize_node`, yield tokens as SSE events in real-time. This requires making the graph pipeline streaming-aware — LangGraph supports this natively via `graph.astream_events()`.

---

### 13. Configure LangSmith (HIGH)

**Current problem:** The `@traceable` decorators are on every node, but `LANGCHAIN_API_KEY` is never set. All tracing is dead code.

**Fix:**
1. Sign up at [smith.langchain.com](https://smith.langchain.com)
2. Create a project called `docwave`
3. Add to `ai/.env`:
```env
LANGCHAIN_API_KEY=lsv2_pt_xxxxxxxxxxxx
LANGCHAIN_PROJECT=docwave
LANGCHAIN_TRACING_V2=true
```

Once enabled, you get:
- **Full trace visualization** — see every node's input/output/latency in a waterfall view
- **Token usage tracking** per call
- **Error traces** — see exactly which node failed and why
- **Dataset & evaluation tools** — create golden test sets and benchmark accuracy
- **Prompt playground** — test prompt changes against real traces

This is the single most impactful change for understanding and debugging your pipeline.

---

### 16. Retry Logic with Tenacity (HIGH)

**Current problem:** Every external call (Cohere, Neo4j, S3) fails on first error with no retry.

**Fix:** Add `tenacity` for retry with exponential backoff:
```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import httpx

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.HTTPStatusError)),
)
async def embed_with_retry(texts: list[str]) -> list[list[float]]:
    ...
```

Apply to: Cohere embed, Cohere rerank, Neo4j queries, S3 operations.

---

### 21. spaCy NER Instead of LLM-Based Extraction (HIGH)

**Current problem:** Entity extraction uses a full LLM call (llama-3.3-70b) for every batch of chunks. This is slow (~2-5s per call) and expensive.

**Fix:** Use spaCy's transformer-based NER as the primary extractor:
```python
import spacy

nlp = spacy.load("en_core_web_trf")  # transformer-based, high accuracy

def extract_entities(text: str) -> list[dict]:
    doc = nlp(text)
    return [
        {"name": ent.text, "type": ent.label_}
        for ent in doc.ents
        if ent.label_ in ("PERSON", "ORG", "GPE", "DATE", "EVENT")
    ]
```

- **100x faster** than LLM calls (runs locally on CPU in ~50ms)
- **Free** — no API costs
- **Deterministic** — same input always produces same output
- Reserve LLM extraction for a second pass on complex/domain-specific entities only

---

### 22. Fix Confidence Scoring (HIGH)

**Current problem:** The confidence threshold check mixes RRF scores (~0.01–0.02) with Cohere rerank scores (0.0–1.0). After RRF but before Cohere rerank, scores are tiny. After Cohere rerank, they're properly 0–1. The threshold of 0.30 may never trigger correctly.

**Fix:** Only use Cohere rerank scores for the confidence decision:
```python
# In rerank_node — only compute confidence from rerank scores
scores = [c.get("rerank_score", 0) for c in top[:5] if "rerank_score" in c]
confidence = sum(scores) / max(1, len(scores)) if scores else 0.0
```

---

### 27. Add Tests (HIGH)

**Current problem:** Zero tests. No way to verify changes don't break things. No way to measure accuracy.

**Minimum test suite:**
```
tests/
  test_chunking.py        — verify chunk sizes, overlap, structure preservation
  test_reranking.py       — verify RRF fusion, dedup, score ordering
  test_entity_extraction.py — verify entity parsing from LLM JSON output
  test_graph_routing.py   — verify route decisions for different query types
  test_evidence_score.py  — verify grounding detection
  test_auth.py            — verify token validation
```

```bash
uv add --dev pytest pytest-asyncio pytest-cov ruff mypy
```

---

### 29. Rate Limiting (HIGH)

**Current problem:** No rate limiting on any endpoint. An attacker with a valid session can spam the chat endpoint and run up your Groq/Cohere bills.

**Fix — Using Upstash Redis rate limiting:**
```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "60 s"),  // 10 requests per minute
});

// In your API route:
const { success } = await ratelimit.limit(userId);
if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
```

---

## Implementation Order (Recommended)

### Phase 1 — Security & Data Integrity (Do first — these are vulnerabilities)
| # | Item | Est. Impact |
|---|---|---|
| 7 | Rotate all secrets | Stops credential exposure |
| 6 | User-scoped search queries | Fixes data leakage between users |
| 8 | Fix AI access approval endpoint | Closes auth bypass |
| 9 | Fix eventsALL data leak | Closes data leak |
| 10 | Timing-safe token comparison | Closes side-channel |

### Phase 2 — Accuracy (The core RAG quality improvements)
| # | Item | Est. Impact |
|---|---|---|
| 1 | LangChain token-based chunking | **Biggest accuracy win** — fixes silent truncation |
| 4 | Embedding batch size guard | Prevents ingest failures on large docs |
| 5 | LangChain CohereEmbeddings | Proper batching, retry, async |
| 22 | Fix confidence scoring | Better retry decisions |
| 25 | Remove duplicate context building | Cleaner synthesis |
| 24 | Deduplicate chunks across retries | Better reranking input |

### Phase 3 — Observability & Reliability
| # | Item | Est. Impact |
|---|---|---|
| 13 | Configure LangSmith | **Instant visibility** into every pipeline step |
| 16 | Tenacity retry logic | No more single-failure crashes |
| 17 | Fix silent index creation failures | Know when Neo4j setup fails |
| 14 | Structured logging | Parseable, queryable logs |
| 15 | Per-node latency metrics | Find bottlenecks |

### Phase 4 — User Experience
| # | Item | Est. Impact |
|---|---|---|
| 11 | Real token streaming | Perceived latency drops from 5s → 0.5s |
| 12 | Fix SSE parsing | No more dropped events |
| 19 | Configure Redis / use Prisma for memory | Persistent conversation history |
| 31 | Paginate chat history | Performance with many conversations |

### Phase 5 — Advanced RAG
| # | Item | Est. Impact |
|---|---|---|
| 2 | Parent-document strategy | Better precision + better context |
| 3 | Structure-aware splitting | Table/section awareness |
| 21 | spaCy NER | 100x faster entity extraction |
| 23 | Query decomposition | Better multi-hop answers |
| 33 | OCR support | Handle scanned PDFs |

### Phase 6 — Engineering Excellence
| # | Item | Est. Impact |
|---|---|---|
| 27 | pytest test suite | Confidence in changes |
| 28 | ruff + mypy + pre-commit | Code quality guardrails |
| 26 | Delete dead code | Clean codebase |
| 29 | Rate limiting | Cost protection |
| 30 | Upload validation | Security + cost protection |
| 35 | Docker health checks | Reliable deployments |
| 36 | Pin dependency versions | Reproducible builds |

---

## Quick Wins (< 30 min each, high impact)

1. **Set up LangSmith** (#13) — just 3 env vars, instant visibility
2. **Add userId to search queries** (#6) — 3 Cypher edits
3. **Replace `dynamic_chunk` with `RecursiveCharacterTextSplitter`** (#1) — ~20 lines changed
4. **Add batch guard to `_embed()`** (#4) — 5 lines
5. **Rotate secrets** (#7) — no code changes, just new keys

---

## What Interviewers Want to See in 2026

| 2023 Code (What you have) | 2026 Code (What they expect) |
|---|---|
| Custom character splitter | LangChain `RecursiveCharacterTextSplitter` with tiktoken |
| Raw `requests.post` to Cohere | `langchain-cohere` `CohereEmbeddings` with retry |
| Manual if/else routing | LangGraph state machine (you have this ✅) |
| `print()` / JSONL file logging | LangSmith tracing + structured logging |
| No tests | pytest + golden query evaluation set |
| Fake streaming (string slicing) | Real LLM token streaming via `stream=True` |
| No user isolation | Row-level security / user-scoped queries |
| No retry on API calls | `tenacity` exponential backoff |
| LLM for everything (NER) | spaCy for fast NER + LLM for complex cases |
| Single chunk size | Parent-document retrieval |
| No evaluation | LangSmith datasets + RAGAS metrics |

---

*Created: 30 March 2026*
*Last updated: 30 March 2026*
