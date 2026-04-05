# Docwave — AI Pipeline: Why It's a Beast

---

## The Problem with Naive RAG

Most "chat with PDF" tools do this:

```
User question → embed → find top 5 chunks → send to LLM → return answer
```

This fails in multiple ways:
- **Single-shot retrieval**: If the top 5 chunks miss the answer, too bad
- **No cross-document reasoning**: Can't connect information across different files
- **Keyword mismatch**: "What did the authors propose?" won't match chunks that say "Vaswani et al. introduced..." because the embeddings aren't close enough
- **Hallucination**: The LLM fills gaps with plausible-sounding garbage
- **No agency**: Can't do anything beyond answering — can't create notes, schedule meetings, or decide it needs more context

Docwave solves all of these. Here's how.

---

## The Pipeline at a Glance

```
                           ┌─────────────────────────────┐
                           │        INGESTION             │
                           │                              │
  PDF ──► extract text ──► │ semantic chunking            │
                           │ parent-doc strategy          │
                           │ Cohere embed-v4.0            │
                           │ Neo4j: chunks + vectors      │
                           │ entity extraction (async)    │
                           │ entity graph (Neo4j nodes)   │
                           └─────────────────────────────┘
                                        │
                           stored, indexed, entity-linked
                                        │
                                        ▼
                           ┌─────────────────────────────┐
                           │        QUERY TIME            │
                           │                              │
  User ──► brain agent ──► │ 4-way parallel search        │
           (LangGraph)     │ hybrid RRF rerank            │
              │            │ Cohere semantic rerank        │
              │            │ brain synthesizes answer      │
              │            │ evidence + hallucination check│
              ▼            └─────────────────────────────┘
         takes actions:
         notes, calendar,
         tasks, more search
```

Two phases. Ingestion builds the knowledge base. Query time tears through it with 4 parallel search strategies, double reranking, and an agent that decides what to do next.

---

## Phase 1: Ingestion — Building the Knowledge Base

### Step 1: PDF Text Extraction

```
PDF bytes → pypdf (primary) → pdfminer (fallback for tables/scanned layouts)
```

pypdf handles standard PDFs. If it extracts suspiciously little text (tables, unusual layouts), falls back to pdfminer-six which handles more complex document structures. Output is page-tagged text with `=== Page N / M ===` headers.

### Step 2: Semantic Chunking with Parent-Doc Strategy

This is where Docwave diverges from 95% of RAG systems. Most systems use fixed-size chunks (500 tokens, 50% overlap). That's lazy and loses context.

**Docwave does semantic chunking:**

```
Raw text
    │
    ▼
Split into ~80-token sentences (tiktoken cl100k_base tokenizer)
    │
    ▼
Embed every sentence via Cohere
    │
    ▼
Compute cosine similarity between consecutive sentence pairs
    │
    ▼
Find "valleys" — points where similarity drops below 25th percentile
    │  (these are natural topic boundaries)
    ▼
Group sentences between valleys into semantic chunks
```

This means chunk boundaries align with **topic shifts**, not arbitrary character counts. A chunk about "attention mechanisms" won't get cut in half because it hit a character limit.

**Parent-doc strategy on top:**

```
Semantic chunks (small, precise — used for search matching)
        │
        │  each child maps to its best-overlapping parent
        ▼
Parent chunks (1200 tokens — used for LLM context)
```

Why? Small chunks are better for search precision (less noise). But the LLM needs more context to generate a good answer. So we search against the small child chunks, but feed the large parent chunks to the LLM. Best of both worlds.

**Fallback**: If the document has fewer than 10 sentences or embedding fails, degrades to fixed 400-token chunks. Robust, not fragile.

### Step 3: Embedding

```
Chunks → Cohere embed-v4.0 (search_document input type) → 1024-dim float vectors
```

- Batched: 96 chunks per API call
- 8 retries with exponential backoff (2s → 120s)
- Rate-limit aware: 3-6 second delay between batches
- Stored directly on Neo4j Chunk nodes

### Step 4: Neo4j Graph Storage

```cypher
(User)-[:OWNS]->(Folder)-[:CONTAINS]->(File)-[:HAS_CHUNK]->(Chunk {
    text: "...",
    parentText: "...",          // larger parent context
    page: 3,
    charStart: 4200,
    charEnd: 5600,
    embedding: [0.012, -0.034, ...]   // 1024 floats
})
```

Three indexes built on Chunk:
- **Vector index** (`chunk_embedding_index`): cosine similarity for semantic search
- **Fulltext index** (`chunk_fulltext`): Lucene-powered text search for keyword matching
- **Entity composite index**: `(normalizedName, type)` on Entity nodes

### Step 5: Entity Extraction (Background)

After the ingest response is sent, a background task runs entity extraction:

```
Each chunk ──► LLM (gpt-4o-mini, tool calling) ──► [{"name": "Transformer", "type": "CONCEPT"}, ...]
                                                              │
                                                              ▼
                                                   Neo4j: MERGE Entity node
                                                   Neo4j: MERGE (Chunk)-[:MENTIONS]->(Entity)
```

Entities are **merged by normalized name** — "Transformer", "transformer", "TRANSFORMER" all point to the same node. This creates cross-document bridges: if Paper A and Paper B both mention "attention mechanism", their chunks are now connected through a shared entity node.

Full details in [ENTITY_EXTRACTION.md](ENTITY_EXTRACTION.md).

---

## Phase 2: Query Time — The Search Gauntlet

When the brain agent calls `search_documents(query)`, the query doesn't go to one search index. It goes to **four, in parallel**.

### The 4-Way Fan-Out

```
                          User query: "How does attention work in transformers?"
                                              │
                    ┌─────────────────────────┼──────────────────────────┐
                    │                         │                          │
                    ▼                         ▼                          ▼
            ┌──────────────┐          ┌──────────────┐          ┌───────────────┐
            │   Vector     │          │    Graph     │          │    Entity     │
            │   Search     │          │    Search    │          │    Graph      │
            │  (top 20)    │          │   (top 12)   │          │   (top 10)    │
            │              │          │              │          │               │
            │ Cohere embed │          │ Neo4j full-  │          │ LLM extracts  │
            │ query → cos  │          │ text index   │          │ entities →    │
            │ similarity   │          │ (Lucene)     │          │ graph walk    │
            │ on Neo4j     │          │ fuzzy ~1     │          │ 1-hop + 2-hop │
            │ vector index │          │ per token    │          │               │
            └──────┬───────┘          └──────┬───────┘          └───────┬───────┘
                   │                         │                          │
                   │    ┌──────────────┐     │                          │
                   │    │    HyDE      │     │                          │
                   │    │  (top 10)    │     │                          │
                   │    │              │     │                          │
                   │    │ Fake answer  │     │                          │
                   │    │ → embed →    │     │                          │
                   │    │ vector search│     │                          │
                   │    └──────┬───────┘     │                          │
                   │           │             │                          │
                   └───────────┴─────────────┴──────────────────────────┘
                                             │
                                     Deduplicate by chunkId
                                             │
                                             ▼
                                   ┌──────────────────┐
                                   │  Hybrid RRF      │
                                   │  Rerank (top 50) │
                                   └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │  Cohere Rerank   │
                                   │  v3.5 (top 20)   │
                                   └────────┬─────────┘
                                            │
                                            ▼
                                    20 reranked chunks
                                    → feed to brain LLM
```

### Why Each Search Path Exists

**Vector Search** — The workhorse. Embeds the query with Cohere, finds chunks with similar embeddings. Good at semantic matching ("How does attention work?" matches chunks about "the attention mechanism computes..."). Over-fetches 2x and filters, returns parent text for richer context.

**Graph Search (Fulltext)** — Lucene fulltext index with fuzzy matching (`~1` suffix = 1 edit distance per token). Catches **keyword matches** that vector search misses. If your document literally says "transformer architecture" and you search "transformer", fulltext nails it even if the embedding similarity is mediocre.

**Entity Graph Search** — LLM extracts entities from the query, then walks the Neo4j graph. Finds chunks connected through shared entities — **the only path that can do cross-document reasoning**. If Paper A mentions "Vaswani" and Paper B mentions "Vaswani", entity graph finds both even if the papers are about completely different topics. 1-hop direct matches get a +0.10 RRF boost, 2-hop bridges get +0.05.

**HyDE (Hypothetical Document Embedding)** — Generates a fake answer to the query, embeds it, and searches for chunks similar to that fake answer. Why? Because sometimes a chunk's content is closer in embedding space to a plausible answer than to the original question. The user asks "What is self-attention?" — the chunk says "Self-attention allows each position to attend to all positions in the previous layer." HyDE bridges that gap.

### Why 4 Paths Beat 1

Each path has blind spots. Vector search misses exact keywords. Fulltext search misses semantic similarity. Entity graph only works when entities overlap. HyDE fails on very specific queries. By running all 4 and merging results, the system covers each other's weaknesses.

The overlap itself is a signal — if a chunk appears in 3 out of 4 searches, it's almost certainly relevant. RRF exploits this.

---

## Double Reranking

### Stage 1: Hybrid RRF (Reciprocal Rank Fusion)

All results from the 4 searches are deduplicated by `(file, text[:64])` and scored:

```
RRF_score = Σ 1/(k + 1 + rank)    for each search path that returned this chunk
          + lexical_bonus            (0.02 per query term found, capped at 0.20)
          + entity_graph_bonus       (+0.10 for 1-hop, +0.05 for 2-hop)
```

RRF is elegant — it doesn't need the individual search paths to agree on score scales. It only uses **rank positions**. A chunk ranked #1 in vector search and #5 in fulltext gets a combined RRF score regardless of what the raw similarity numbers were.

Output: top 50 candidates, sorted by fused score.

### Stage 2: Cohere Semantic Rerank

The top 50 RRF results go to Cohere's Rerank v3.5 API:

```
Cohere receives: (query, [chunk_text_1, chunk_text_2, ...])
Cohere returns:  semantic relevance scores per chunk
```

Cohere's reranker is a **cross-encoder** — it looks at the query and chunk together, not just their embeddings. This is more computationally expensive than cosine similarity, but much more accurate for determining if a chunk actually answers the question.

- Up to 4000 chars per chunk sent
- 3 retries with exponential backoff
- Falls back to hybrid RRF order if Cohere API fails

Output: top 20 chunks, the final set fed to the brain.

### Why Double Reranking

RRF is fast but dumb — it fuses ranks without understanding content. Cohere is smart but expensive — $0.001 per 1000 queries. Running Cohere on all 52+ raw results would be slow and costly. So RRF narrows down to 50, then Cohere does the precision pass. Fast filter → smart filter.

---

## The Brain Agent (LangGraph)

This is the core intelligence layer. Not a single LLM call — a **loop**.

### Graph Topology

```
    ┌─────────┐
    │  init   │ ─── build messages from history + system prompt + question
    └────┬────┘
         │
         ▼
    ┌─────────┐         ┌─────────┐
    │  brain  │ ◄─────► │  tools  │   ← can loop up to 10 times
    └────┬────┘         └─────────┘
         │
         │ (brain decides to respond with text, not make another tool call)
         ▼
    ┌──────────┐
    │ finalize │ ─── evidence scoring, hallucination check, source extraction
    └────┬─────┘
         │
         ▼
       [END]
```

### How the Brain Thinks

The brain is an LLM (gpt-4o-mini, temp 0.1) with access to 7 tools. At each step, it decides:

1. **"I need to search the user's documents"** → calls `search_documents(query)` → gets back formatted search results → loops back to brain
2. **"I need to create a note"** → calls `create_note(title, content)` → gets confirmation → loops back
3. **"I should check their calendar first"** → calls `get_calendar(start, end)` → gets events → loops back
4. **"I have enough info to answer"** → generates text response → flows to finalize

The brain can **chain multiple tools**. Example:

```
User: "Write up notes from my ML paper about attention"

Brain step 1: search_documents("attention mechanisms ML paper")
    → gets 20 chunks with specific content

Brain step 2: create_note(title="Attention Mechanisms - Notes", content="## Key Concepts\n\n...")
    → note created, got confirmation

Brain step 3: responds "I've created a note titled 'Attention Mechanisms' with the key findings from your paper. [cites sources]"
```

Three tool calls, one user message. The brain decided everything autonomously.

### Safety Rails

- **Max 10 steps**: At step 10, the brain is forced to generate a text response (tool schemas not included). Prevents infinite loops.
- **Scratchpad**: Every tool call and result is logged to a scratchpad for debugging.
- **Error isolation**: If a tool fails, the error message is returned to the brain as a tool result — it can decide to retry, try a different approach, or tell the user.

---

## Anti-Hallucination System

This is where accuracy comes from. Multiple layers, not one silver bullet.

### Layer 1: System Prompt Grounding

The brain operates under explicit grounding rules:

```
For DOCUMENT FACTS (numbers, names, dates, values from search results):
  - Quote them EXACTLY as they appear. Never change a number, name, or value.
  - If a passage says 'l=9', you say 'l=9'. Never approximate or reword.
  - Cite as [chunk_number, page] so the user can verify.
  - If search results don't contain it, say 'this wasn't found in your documents.'

For REASONING and GENERAL KNOWLEDGE:
  - Be smart. Connect ideas. Use your own knowledge for context, explanations, analogies.
  - Clearly separate what's from documents vs your own knowledge.
```

This is the nuanced middle ground — the brain can reason freely but must never alter specific document facts.

### Layer 2: Evidence Scoring

After the brain generates its answer, the finalize node computes:

```
evidence_score = (answer tokens found in top-10 chunks) / (total answer tokens)
```

Only tokens >3 characters are counted (filters out "the", "is", "a"). If the evidence score is below **0.20**, the answer is flagged as `low_evidence` — meaning less than 20% of the answer's substance comes from the actual documents.

### Layer 3: Hallucination Detection

```
hallucination_score = (unsupported claims) / (total claims)
```

Where "claims" = numbers + proper nouns (capitalized words) in the answer. Each claim is checked against the top-15 source chunks. If a number or proper noun in the answer doesn't appear anywhere in the source chunks, it's flagged as unsupported.

If the hallucination score exceeds **0.40** (40% of claims unsupported), a warning is prepended to the answer and the status is set to `hallucination_warning`.

### Layer 4: Temperature Control

All LLM calls use **temperature 0.1** — near-deterministic output. Higher temperatures make the LLM more "creative" (read: more likely to make things up). 0.1 keeps it grounded while allowing slight variation in phrasing.

### Layer 5: Parent-Doc Context

Each search result carries its **parent text** (1200 tokens of surrounding context). The brain doesn't just see a small snippet — it sees the broader passage, reducing the chance of misinterpreting an out-of-context fragment.

### Layer 6: Citation Enforcement

The system prompt requires `[chunk_number, page]` citations for any document fact. This makes hallucination visible — if the brain cites `[3, p.5]` and that chunk doesn't contain the claimed information, the references panel in the UI lets the user verify immediately.

---

## Everything Together: A Query Walkthrough

User asks: **"What are the key differences between self-attention and cross-attention in my uploaded papers?"**

```
1. INIT
   Load last 8 messages of chat history
   Build system prompt with today's date + grounding rules
   Append user question

2. BRAIN (step 1)
   LLM sees the question involves user's documents
   Decides: call search_documents("self-attention vs cross-attention differences")

3. TOOLS
   search_documents triggers _run_full_search():
   
   ├── Vector Search: embeds query → cosine on Neo4j → 20 chunks
   ├── Graph Search: Lucene fulltext "self~1 attention~1 cross~1" → 12 chunks
   ├── Entity Graph: extracts ["Self-Attention", "Cross-Attention"]
   │     → walks Neo4j → 1-hop matches + 2-hop bridges → 10 chunks
   └── HyDE: fake answer embedded → vector search → 10 chunks
   
   Total: ~52 chunks (some duplicates)
   Deduplicate by chunkId → ~35 unique
   
   Hybrid RRF rerank → top 50
   Cohere semantic rerank → top 20
   
   Format as: "[1] paper_a.pdf, p.4\nSelf-attention allows each position..."

4. BRAIN (step 2)
   Receives 20 formatted chunks
   Has enough information to answer
   Generates response:
   "Based on your papers, the key differences are:
    1. **Self-attention** operates within a single sequence [1, p.4] [3, p.7]...
    2. **Cross-attention** connects two different sequences [5, p.12]...
    Your ML fundamentals paper specifically notes that... [8, p.3]"

5. FINALIZE
   Evidence score: 0.67 (67% of answer tokens found in chunks) ✓
   Hallucination score: 0.08 (only 8% of claims unsupported) ✓
   Status: "grounded"
   Extract sources: [{file: "paper_a.pdf", page: 4, preview: "Self-attention allows..."}]
   Save to Redis chat memory

6. STREAM
   Answer streamed to frontend 4 chars at a time
   Status events: "Searching your documents..." → tokens → sources → done
```

Total pipeline: 3 LLM calls (brain step 1 + entity extraction + brain step 2) + 2 Cohere embeds + 1 Cohere rerank + 4 Neo4j queries. ~$0.003 total. All in a few seconds.

---

## Why This Pipeline Beats Simple RAG

| Problem | Simple RAG | Docwave |
|---------|-----------|------------|
| Top-5 chunks miss the answer | Stuck — returns bad answer | 4 search paths with 50+ candidates, double reranked |
| Cross-document question | Impossible — searches each file independently | Entity graph bridges shared concepts across files |
| Keyword vs semantic gap | Pick one or the other | Both: vector (semantic) + fulltext (keyword) + HyDE (bridged) |
| Hallucinated facts | Hope the LLM doesn't lie | Evidence scoring + hallucination detection + citation enforcement |
| Generic question about your docs | Always searches even for "hi" | Brain decides: general question → answer directly, doc question → search first |
| "Summarize this into notes" | Copy-paste the answer yourself | Brain chains: search → create_note → confirm |
| Follow-up questions | No context | Redis chat memory, last 8 messages injected into context |
| One search attempt | Single-shot | Agent loop — brain can search again with refined query if first attempt insufficient |

---

## Cost Profile

### LLM Calls Only (gpt-4o-mini @ $0.15/1K input, $0.60/1K output)

A typical document question makes **3 LLM calls**:

| # | LLM Call | Input Tokens | Output Tokens | Input Cost | Output Cost | Total |
|---|----------|-------------|--------------|-----------|------------|-------|
| 1 | Brain step 1 (decides to search) | ~2,950 | ~75 | $0.000443 | $0.000045 | $0.000488 |
| 2 | Entity extraction (from query) | ~325 | ~100 | $0.000049 | $0.000060 | $0.000109 |
| 3 | Brain step 2 (synthesizes answer) | ~6,000 | ~800 | $0.000900 | $0.000480 | $0.001380 |
| | **LLM Total** | **~9,275** | **~975** | **$0.001392** | **$0.000585** | **$0.001977** |

**Where the input tokens come from:**

- Brain step 1 (~2,950): system prompt ~550 + chat history (8 msgs × 800 chars) ~1,600 + user question ~100 + 7 tool schemas ~700
- Entity extraction (~325): system prompt ~45 + query text ~80 + 1 tool schema ~200
- Brain step 2 (~6,000): everything from step 1 ~2,950 + assistant tool_call ~50 + search results (15 chunks × 800 chars) ~3,000

### Full Query Cost (LLM + API calls + infrastructure)

| Operation | Cost |
|-----------|------|
| LLM calls (3x gpt-4o-mini) | ~$0.002 |
| Cohere embed × 2 (query + HyDE) | Free tier / ~$0.0001 |
| Cohere rerank (50 docs) | ~$0.001 |
| Neo4j queries (4 searches) | Infrastructure cost only |
| Redis (chat history) | Infrastructure cost only |
| **Total per message** | **~$0.003** |

### Per PDF Ingestion

| Operation | Cost |
|-----------|------|
| Cohere embed (chunks) | Free tier / ~$0.001 |
| Entity extraction (per chunk) | ~$0.0001 × N chunks |
| **Total for 20-page PDF** | **~$0.002-0.005** |

All tracked in `logs/llm_costs.jsonl` and queryable via `GET /usage/summary`.
