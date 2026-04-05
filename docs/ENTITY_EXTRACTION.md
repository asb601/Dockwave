# Entity Extraction & Graph Search — How It Actually Works

---

## The 30-Second Version

When you upload a PDF, we run each text chunk through an LLM to extract named entities (people, orgs, concepts, dates, locations). These become `Entity` nodes in Neo4j, linked to their source `Chunk` nodes with `MENTIONS` edges. At query time, we extract entities from the user's question and walk the graph to find relevant chunks — including cross-document links the vector search would never find.

It's one of **4 parallel search paths**. It adds value for cross-document questions ("what do my notes say about transformers AND attention?") but costs an LLM call per chunk at ingestion AND an LLM call per query.

---

## Architecture

```
                ┌──────────────────────────────────────────┐
                │               INGESTION                  │
                │                                          │
  PDF ──► chunks ──► EntityExtractor.extract(chunk)        │
                │         │                                │
                │         ▼                                │
                │    LLM tool-call (gpt-4o-mini)           │
                │    "extract entities from this text"     │
                │         │                                │
                │         ▼                                │
                │    [{"name": "Transformer", "type": "CONCEPT"},  │
                │     {"name": "Vaswani",     "type": "PERSON"}]   │
                │         │                                │
                │         ▼                                │
                │    Neo4j: MERGE (Entity) nodes           │
                │    Neo4j: MERGE (Chunk)-[:MENTIONS]->(Entity)    │
                └──────────────────────────────────────────┘

                ┌──────────────────────────────────────────┐
                │              QUERY TIME                   │
                │                                          │
  "How does attention work    ──► EntityExtractor.extract(query)   │
   in transformers?"          │         │                  │
                              │         ▼                  │
                              │  entities: ["Attention", "Transformer"]
                              │         │                  │
                              │         ▼                  │
                              │  Neo4j graph traversal:    │
                              │    1-hop: Chunk ──MENTIONS──► Entity (direct match)
                              │    2-hop: Chunk₁ ──MENTIONS──► Entity ◄──MENTIONS── Chunk₂
                              │          (cross-document bridge)       │
                              │         │                  │
                              │         ▼                  │
                              │  Chunks fed into reranker  │
                              └──────────────────────────────────────────┘
```

---

## Where It Sits in the Search Pipeline

When the brain calls `search_documents(query)`, the pipeline fans out **4 searches in parallel**:

| # | Search Path | What It Does | Source |
|---|---|---|---|
| 1 | **Vector Search** (top 20) | Cosine similarity on Cohere embeddings | `vector` |
| 2 | **Graph Search** (top 12) | Neo4j full-text `CONTAINS` on chunk text | `graph` |
| 3 | **Entity Graph Search** (top 10) | LLM extracts entities from query → walks Neo4j graph | `entity_graph` |
| 4 | **HyDE** (top 10) | Fake answer → embed → vector search (hypothetical doc embedding) | `vector_hyde` |

All results merge → **Hybrid RRF rerank** → **Cohere semantic rerank** → top 20 chunks to the brain.

Entity graph results get a **bonus in the reranker**:
- 1-hop direct match: **+0.10** RRF boost
- 2-hop bridge match: **+0.05** RRF boost

So entity graph chunks get prioritized, but they still compete with vector/graph results in the final ranking.

---

## Ingestion: What Happens Per Chunk

File: `ai/app/services/entity_extraction.py` → `EntityExtractor`

### The LLM Call

```python
resp = self._client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "You are an entity extraction system..."},
        {"role": "user",   "content": f"Extract entities from:\n\n{chunk_text[:3000]}"},
    ],
    tools=[_ENTITY_TOOL],                              # OpenAI function calling
    tool_choice={"type": "function", "function": {"name": "store_entities"}},
    temperature=0.0,
    max_tokens=600,
)
```

Key design choices:
- **Tool calling, not JSON parsing.** The LLM is forced to call `store_entities(entities=[...])`. This gives us typed, structured output without regex/JSON hacks. Much more reliable than asking the LLM to output raw JSON.
- **`tool_choice: forced`**. The model MUST call the tool — it can't just respond with text.
- **Max 15 entities per chunk.** Hardcoded in the tool schema and validated in `_parse_tool_response()`.
- **5 entity types:** `PERSON`, `ORGANIZATION`, `CONCEPT`, `DATE`, `LOCATION`.
- **3000 char limit on input.** Prevents token overflow for large chunks.
- **temperature=0.0.** Deterministic extraction — same input always gives same entities.

### The Tool Schema

```json
{
  "name": "store_entities",
  "parameters": {
    "entities": [
      { "name": "string (max 5 words, title-cased)", "type": "PERSON|ORG|CONCEPT|DATE|LOCATION" }
    ]
  }
}
```

### Neo4j Storage

File: `ai/app/services/graph.py` → `GraphClient.upsert_chunk_entities()`

```cypher
MATCH (c:Chunk {chunkId: $chunkId})
UNWIND $entities AS ent
MERGE (e:Entity {normalizedName: toLower(ent.name), type: ent.type})
  ON CREATE SET e.name = ent.name, e.createdAt = timestamp()
MERGE (c)-[:MENTIONS]->(e)
```

**`MERGE` on `normalizedName`** is the critical part. If chunk A mentions "Transformer" and chunk B mentions "transformer", they both point to the **same Entity node**. This is how cross-document linking works — the entity node becomes a bridge between chunks from different files.

The graph looks like:
```
(File A) ──HAS_CHUNK──► (Chunk₁) ──MENTIONS──► (Entity: "transformer")
(File B) ──HAS_CHUNK──► (Chunk₂) ──MENTIONS──► (Entity: "transformer")
```
Chunk₁ and Chunk₂ are now connected through the shared entity.

### Timing

This runs as a **FastAPI BackgroundTask** — the ingest endpoint returns `200` immediately, then entity extraction happens async. If it fails, ingest still succeeds (non-fatal). You'll see it in logs:

```
Background enrichment complete: 47 entities across 12 chunks
```

---

## Query Time: EntityGraphSearchTool

File: `ai/app/agents/tools.py` → `EntityGraphSearchTool.run()`

### Step 1: Extract Entities from the Query

Same `EntityExtractor` used at ingestion. Runs the user's question through gpt-4o-mini to pull out entity names.

Example: `"What does Vaswani say about attention mechanisms?"` → `["Vaswani", "Attention Mechanisms"]`

**Fallback:** If the LLM returns no entities (short query, weird phrasing), falls back to keyword extraction — splits the query into words >3 chars, filters out stopwords, takes top 5.

### Step 2: Neo4j Graph Traversal

File: `ai/app/services/graph.py` → `GraphClient.entity_graph_search()`

One Cypher query does both 1-hop and 2-hop in a single pass (UNION):

**1-hop (direct):**
```
Query entity: "Transformer"
                    ↓
(Entity: transformer) ◄──MENTIONS── (Chunk) ◄──HAS_CHUNK── (File)
```
Finds chunks that directly mention the entity. Score boost: **+0.10**

**2-hop (bridge / cross-document):**
```
Query entity: "Transformer"
                    ↓
(Entity: transformer) ◄──MENTIONS── (Chunk₁) ──MENTIONS──► (Entity: "self-attention")
                                                                       ↓
                              (Chunk₂) ──MENTIONS──► (Entity: "self-attention")
```
Chunk₁ mentions "transformer" AND "self-attention". Chunk₂ also mentions "self-attention" (possibly in a different file). We return Chunk₂ as a 2-hop result — it's related through a shared entity, even though it never mentions "transformer" directly. Score boost: **+0.05**

**User scoping:** All queries filter by `f.userEmail = $userEmail` so you only get chunks from your own files.

**Entity matching:** Uses `CONTAINS` not exact match — so searching for "transform" will match entity "Transformer Architecture".

---

## Cost

Each LLM call to gpt-4o-mini for entity extraction:
- ~200-400 prompt tokens (system + chunk text)
- ~50-150 completion tokens (entity list)
- **~$0.00005-0.00015 per chunk** at current Azure pricing

For a 20-page PDF with 12 chunks: **~$0.001-0.002** total ingestion entity cost.

At query time: **1 additional LLM call** to extract entities from the question (~$0.00005).

All costs logged to `ai/logs/llm_costs.jsonl` with `caller: "entity_extraction"`.

---

## When It Helps vs When It Doesn't

### Helps

- **Cross-document queries**: "Compare what Paper A and Paper B say about X" — vector search treats each file independently. Entity graph finds the bridge through shared entities.
- **Precise entity lookup**: "What did Vaswani propose?" — entity graph finds chunks mentioning "Vaswani" directly, even if the embedding similarity is low because the chunk talks about "the authors of the 2017 paper."
- **Concept clustering**: Multiple chunks across files discussing "attention" get linked through the shared CONCEPT entity, surfacing related context vector search might rank lower.

### Doesn't Help

- **Direct factual questions**: "What is the learning rate in chapter 3?" — vector search handles this fine. No entity bridge needed.
- **Single-document queries**: If you only have one PDF, there's nothing to bridge.
- **Poorly extracted entities**: If the LLM extracts "The Model" instead of "Transformer" as an entity, the bridge is useless. Extraction quality depends on chunk text quality.

### The Trade-off

Entity extraction is the **most expensive part of ingestion** (1 LLM call per chunk). It powers 1 of 4 search paths. The other 3 (vector, graph text, HyDE) work without it. If you disabled entity extraction entirely, search would still work — you'd lose cross-document bridging and the entity-specific ranking bonus, but vector + Cohere rerank would still give good results for most queries.

---

## Code Map

| File | What It Does |
|---|---|
| `ai/app/services/entity_extraction.py` | `EntityExtractor` class — LLM tool-calling to extract entities from text |
| `ai/app/services/graph.py` | `upsert_chunk_entities()` — stores in Neo4j. `entity_graph_search()` — 1-hop + 2-hop query |
| `ai/app/agents/tools.py` | `EntityGraphSearchTool` — async wrapper, one of 4 search backends |
| `ai/app/core/graph.py` | `_run_full_search()` — fans out all 4 search paths in parallel |
| `ai/app/agents/rerank.py` | `hybrid_rerank()` — gives entity_graph results +0.05/+0.10 RRF bonus |
| `ai/app/services/ingest_service.py` | `enrich_entities()` — BackgroundTask that runs extraction after ingest |
