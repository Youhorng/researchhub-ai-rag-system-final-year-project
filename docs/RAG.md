# Intelligent Query Router for RAG Pipeline

## Problem
All queries currently go through the same retrieval path (embed → hybrid search → top-K chunks). This fails for:
- **Broad queries** ("main results from all papers") — top-K only returns chunks from 1-2 papers
- **Meta queries** ("list all my papers") — needs DB metadata, not chunk search
- **Targeted queries** ("summarize the attention paper") — needs chunks from ONE specific paper

## Solution
Add an LLM-based **query router node** after guardrail that classifies queries into 4 types, each with a different retrieval strategy.

## Query Types & Strategies

| Type | Example | Retrieval Strategy |
|------|---------|-------------------|
| **SPECIFIC** | "How does attention work?" | Current hybrid search (no change) |
| **BROAD** | "Compare results across all papers" | Fetch top 2-3 chunks per paper/document |
| **META** | "List all my papers" | Skip OpenSearch, use PostgreSQL metadata |
| **TARGETED** | "Summarize the RAG paper" | Filter chunks to one paper by title |

## Implementation Steps

### 1. Extend AgentState (`backend/src/services/agents/state.py`)
Add fields: `query_type`, `target_paper_title`, `paper_titles`

### 2. Add router prompt (`backend/src/services/agents/prompts.py`)
- `ROUTER_PROMPT` — classifies query type, extracts target paper title for TARGETED
- `SYSTEM_TEMPLATE_META` — system prompt for META queries with structured paper metadata
- Uses paper titles list so LLM can match "the attention paper" → exact title

### 3. Create router node (`backend/src/services/agents/nodes/route_query.py`) [NEW FILE]
- Single gpt-4o-mini call (fast, cheap)
- Returns `query_type` + `target_paper_title`
- Falls back to SPECIFIC on error

### 4. Update retrieve node (`backend/src/services/agents/nodes/retrieve.py`)
- Add `_search_broad()` — aggregates all sources, fetches top 2-3 chunks per source via KNN
- Add `_search_targeted()` — filters by paper title, runs hybrid search within that paper
- Branch `retrieve_node()` on `query_type`:
  - META → return empty chunks (handled in pipeline)
  - BROAD → `_search_broad()`
  - TARGETED → `_search_targeted()` with fallback to SPECIFIC
  - SPECIFIC → current logic (unchanged)

### 5. Update graph (`backend/src/services/agents/graph.py`)
New flow: `guardrail → route_query → retrieve → grade_docs → (rewrite | END)`
- META exits graph early (goes to END after router)
- BROAD skips rewrite loop (coverage is intentional)

### 6. Update pipeline (`backend/src/services/rag/pipeline.py`)
- Move paper_titles fetch **before** graph invocation (currently after)
- Pass `paper_titles` into agent state for router
- After graph: if META → build rich metadata context from PostgreSQL (titles, authors, abstracts, categories, dates) and use `SYSTEM_TEMPLATE_META`
- Add `_build_meta_context()` helper
- Add `query_type` to saved message metadata

### 7. Update grade prompt (`backend/src/services/agents/prompts.py`)
Already done — the "be generous" instruction helps BROAD queries retain more chunks.

## Key Architecture Decision
META queries are handled in the **pipeline** (not graph) because:
- The graph doesn't have access to the SQLAlchemy `db` session
- The pipeline already has `db` and can query rich metadata
- The graph classifies → exits early, pipeline takes over for generation

## Files Modified
- `backend/src/services/agents/state.py` — add 3 fields
- `backend/src/services/agents/prompts.py` — add ROUTER_PROMPT, SYSTEM_TEMPLATE_META
- `backend/src/services/agents/nodes/route_query.py` — **new file**
- `backend/src/services/agents/nodes/retrieve.py` — add _search_broad, _search_targeted, branch logic
- `backend/src/services/agents/graph.py` — add router node, update edges
- `backend/src/services/rag/pipeline.py` — move paper fetch, add META handling
- `backend/src/services/rag/prompts.py` — add build_meta_system_message()

## Verification
1. Rebuild API: `docker compose up --build -d api`
2. Check logs: `docker logs researchhub-api --tail 50`
3. Test each query type:
   - SPECIFIC: "How does attention mechanism work in transformers?"
   - BROAD: "What are the main results and key findings from all papers?"
   - META: "List all papers in my knowledge base"
   - TARGETED: "Summarize the paper about [specific paper name]"
4. Verify metadata in logs shows correct `query_type` classification
