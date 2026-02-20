# ResearchHub — System Architecture & Feature Breakdown

---

## 1. Infrastructure Services Map

Every service has a specific job. Nothing overlaps.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER (Browser)                             │
│                    React + TypeScript + Vite                        │
│         Auth: Clerk  ←→  API: FastAPI  ←→  Chat: Ollama            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP / REST
┌──────────────────────────────▼──────────────────────────────────────┐
│                      FastAPI Backend                                 │
│          Routers → Services → Repositories → Models                 │
└───┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┘
    │          │          │          │          │          │
    ▼          ▼          ▼          ▼          ▼          ▼
PostgreSQL  OpenSearch  Redis    Ollama     MinIO     Langfuse
(app data) (search +  (cache)  (local LLM) (PDFs)  (tracing)
            vectors)
                               ▲
                        Airflow (DAGs)
                    ─────────────────────
                    Scheduled ArXiv fetch
                    → Parse → Embed → Index
```

### Service Roles

| Service                 | Role                                                                             | When Used                                |
| ----------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| **PostgreSQL**          | Application database — users, projects, papers, chat history                     | Every request that reads/writes app data |
| **OpenSearch**          | Two indices: `arxiv-metadata` (paper discovery) + `arxiv-chunks` (RAG retrieval) | Project creation search, RAG chat        |
| **Redis**               | Cache — search results, user sessions                                            | Search endpoints, repeated queries       |
| **Ollama**              | Local LLM — generates RAG answers and agentic reasoning                          | Every chat message                       |
| **MinIO**               | Object storage — uploaded PDF files                                              | PDF upload, download, processing         |
| **Langfuse**            | LLM observability — traces every LLM call (input, output, latency, tokens)       | All Ollama/Jina calls                    |
| **Airflow**             | Pipeline orchestration — ArXiv bulk load + daily OAI-PMH updates                 | Startup bulk import + nightly updates    |
| **Clerk**               | Authentication — issues JWT tokens, manages user sessions                        | Every authenticated API call             |
| **Jina AI**             | Embeddings API — converts text to 1024-dim vectors                               | Indexing + query embedding               |
| **ArXiv API / OAI-PMH** | External paper source — used ONLY by Airflow (not live requests)                 | Bulk load + nightly new-paper harvesting |

---

## 2. Data Flow Diagrams

### 2.0 ArXiv Pre-Population (Airflow — runs before users arrive)

```
Airflow: arxiv_bulk_load (once)
  └── Download Kaggle ArXiv dataset (2M+ papers as JSON)
        └── Filter: cs.* and stat.ML categories only
              └── Insert into papers table (PostgreSQL)
                    └── Embed title + abstract (Jina AI)
                          └── Index in arxiv-metadata (OpenSearch)

Airflow: arxiv_daily_update (nightly)
  └── Poll ArXiv OAI-PMH for new papers per category
        └── Insert new rows into papers
              └── Embed + index into arxiv-metadata
```

### 2.1 Project Creation — Paper Discovery Flow

```
User fills Project Creation Wizard (5 steps)
        │
        ▼
Step 1-4 form data saved to projects table
        │
        ├── research_goal (text) → Jina AI → 1024-dim query vector
        ├── initial_keywords    → BM25 query on title + abstract
        ├── arxiv_categories    → category filter (cs.AI, cs.LG, etc.)
        └── year_from/year_to   → date range filter
        │
        ▼
OpenSearch: arxiv-metadata index (hybrid search)
  ├── BM25   on title + abstract using keywords
  ├── KNN    on abstract_vector using research_goal vector
  └── RRF    combines both scores
        │
        ▼
Top-N results returned → insert into project_papers (status=suggested)
        │
        ▼
Step 5: User reviews paper cards + can upload own PDFs
  ├── Accept paper  → project_papers.status = accepted
  │                 → background: fetch PDF → parse → chunk → embed
  │                 → index in arxiv-chunks (OpenSearch)
  ├── Reject paper  → project_papers.status = rejected
  └── Upload PDF    → MinIO upload → parse → chunk → embed
                    → index in arxiv-chunks
        │
        ▼
Project is CREATED only after ≥1 paper accepted or ≥1 PDF uploaded
```

### 2.2 Full-Text Indexing (triggered on accept)

```
paper accepted / PDF uploaded
        │
        ▼
Fetch PDF → parse with docling (text extraction)
        │
        ▼
TextChunker → split into 600-char chunks, 100-char overlap
        │
        ▼
Jina AI API → embed each chunk → 1024-dim vector
        │
        ▼
OpenSearch arxiv-chunks → { chunk_text, vector, paper_id/doc_id, project_id }
        │
        ▼
PostgreSQL → papers.chunks_indexed = True (or documents.chunks_indexed = True)
```

### 2.3 RAG Chat Flow

```
User sends message in project chat
        │
        ▼
FastAPI /chat endpoint
        │
        ├── 1. Embed user query  →  Jina AI  →  1024-dim vector
        │
        ├── 2. Hybrid search  →  OpenSearch
        │       ├── BM25 (keyword match on chunk_text)
        │       └── KNN  (vector similarity on embeddings)
        │       └── RRF  (combine BM25 + KNN scores)
        │
        ├── 3. Top-K chunks returned (scoped to project_id)
        │
        ├── 4. Build prompt  →  [system] + [context chunks] + [user query]
        │
        ├── 5. Generate answer  →  Ollama (llama3.2)
        │
        ├── 6. Save to PostgreSQL  →  chat_messages (content + cited_sources JSON)
        │
        └── 7. Trace entire call  →  Langfuse
```

### 2.4 Agentic RAG Flow (LangGraph)

```
User query enters LangGraph StateGraph
        │
  ┌─────▼────────┐
  │  Guardrail   │ ← Is this query in scope for the project? (LLM check)
  └─────┬────────┘
        │ YES
  ┌─────▼────────┐
  │   Retrieve   │ ← Hybrid search OpenSearch (same as RAG flow)
  └─────┬────────┘
        │
  ┌─────▼────────┐
  │  Grade Docs  │ ← Are retrieved chunks relevant? (LLM grades each)
  └──┬───────────┘
     │ relevant        │ not relevant
     │                 ▼
     │         ┌───────────────┐
     │         │ Rewrite Query │ ← Expand/rephrase + retrieve again
     │         └───────────────┘
     │
  ┌──▼───────────────┐
  │ Generate Answer   │ ← Build prompt + Ollama + cited sources
  └──────────────────┘
```

---

## 3. Feature Breakdown

### Feature 1 — User Authentication

**Service:** Clerk + FastAPI `dependencies.py`

| Sub-feature       | What it does                                                                |
| ----------------- | --------------------------------------------------------------------------- |
| Sign up / Sign in | Handled entirely by Clerk (hosted UI or Clerk components in React)          |
| JWT verification  | FastAPI `get_current_user()` dependency verifies Clerk JWT on every request |
| Auto-create user  | On first login, FastAPI upserts a `users` row from the Clerk JWT payload    |
| Protected routes  | Any route using `Depends(get_current_user)` returns 401 if no valid token   |

---

### Feature 2 — Project Management

**Service:** FastAPI + PostgreSQL

| Sub-feature                | Endpoint                | DB Tables                                 |
| -------------------------- | ----------------------- | ----------------------------------------- |
| Create project (with form) | `POST /projects`        | `projects`, `project_topics`              |
| List my projects           | `GET /projects`         | `projects`                                |
| View project detail        | `GET /projects/{id}`    | `projects`, `project_papers`, `documents` |
| Archive project            | `PATCH /projects/{id}`  | `projects.status`                         |
| Delete project             | `DELETE /projects/{id}` | cascade all related rows                  |

---

### Feature 3 — Paper Discovery (Starter Pack)

**Services:** FastAPI + OpenSearch (`arxiv-metadata`) + Jina AI + PostgreSQL

| Sub-feature                  | What it does                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| Embed research goal          | Jina AI embeds the research_goal text → 1024-dim query vector                            |
| Hybrid search                | Query `arxiv-metadata` OpenSearch index — BM25 (keywords) + KNN (semantic) + RRF ranking |
| Filter by category + date    | Apply arxiv_categories and year_from/year_to as hard filters                             |
| Deduplicate                  | Skip papers already in this project's `project_papers`                                   |
| Suggest papers               | Top-N results → insert into `project_papers` with `status=suggested`                     |
| Accept / Reject / Upload PDF | Step 5 is mandatory — `PATCH` status + optional `POST /documents` for PDF upload         |
| Trigger full-text indexing   | On accept → background task: PDF → parse → chunk → embed → index in `arxiv-chunks`       |

---

### Feature 4 — PDF Upload

**Services:** FastAPI + MinIO + PostgreSQL

| Sub-feature     | What it does                                                   |
| --------------- | -------------------------------------------------------------- |
| Upload file     | `POST /projects/{id}/documents` → stream file to MinIO bucket  |
| Store reference | Insert row in `documents` table with MinIO bucket + key        |
| Process file    | Background task: docling parse → chunk → embed → index         |
| List documents  | `GET /projects/{id}/documents` → list with `is_indexed` status |
| Delete document | Remove from MinIO + PostgreSQL + OpenSearch                    |

---

### Feature 5 — Hybrid Search

**Services:** FastAPI + OpenSearch + Jina AI + Redis

| Sub-feature    | What it does                                                      |
| -------------- | ----------------------------------------------------------------- |
| Embed query    | Jina AI converts user search text to 1024-dim vector              |
| BM25 search    | Keyword match against `chunk_text` field in OpenSearch            |
| KNN search     | Cosine similarity against stored vectors                          |
| RRF ranking    | Reciprocal Rank Fusion combines both scores for final ranking     |
| Project filter | Results scoped to `project_id` — can't see other projects' papers |
| Redis cache    | Cache search results by `(project_id, query_hash)` for 6 hours    |

---

### Feature 6 — RAG Chat

**Services:** FastAPI + OpenSearch + Jina AI + Ollama + PostgreSQL + Langfuse

| Sub-feature         | What it does                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| New chat session    | `POST /projects/{id}/chat/sessions` → creates `chat_sessions` row        |
| Send message        | `POST /sessions/{id}/messages` → full RAG pipeline → save both turns     |
| Stream response     | Ollama supports streaming → FastAPI streams tokens back to React         |
| Citation display    | Response includes `cited_sources` array with paper title + chunk excerpt |
| Chat history        | `GET /sessions/{id}/messages` → paginated message list                   |
| Trace with Langfuse | Every LLM call (embed + generate) is traced with input/output/latency    |

---

### Feature 7 — Agentic RAG

**Services:** FastAPI + LangGraph + OpenSearch + Jina AI + Ollama + Langfuse

| Sub-feature          | What it does                                                                   |
| -------------------- | ------------------------------------------------------------------------------ |
| Guardrail node       | LLM checks if query is on-topic for the project — rejects irrelevant questions |
| Retrieve node        | Same hybrid search as Feature 5                                                |
| Grade docs node      | LLM scores each retrieved chunk: relevant / irrelevant                         |
| Rewrite query node   | If docs are poor quality, LLM rewrites the query and retrieves again           |
| Generate answer node | Final answer generation with all relevant context                              |
| Fallback             | If query out of scope, return a polite "out of scope" message                  |

---

### Feature 8 — Living Knowledge Base

**Services:** FastAPI + ArXiv API + OpenSearch + PostgreSQL + Airflow

| Sub-feature        | What it does                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Add new topic      | `POST /projects/{id}/topics` → adds to `project_topics` table                                             |
| Topic sync         | `POST /projects/{id}/topics/{topic_id}/sync` → fetch new ArXiv papers for that topic                      |
| Suggest new papers | Same as Starter Pack but for the new/updated topic                                                        |
| Flag low relevance | Background job scores existing papers against current topic — flags <30% similarity                       |
| Clean old papers   | User reviews flagged papers → `DELETE /projects/{id}/papers/{paper_id}` removes from project + OpenSearch |
| Sync history       | Every sync is recorded in `sync_events` table                                                             |
| Airflow DAG        | Scheduled daily sync per active project — runs all topic syncs automatically                              |

---

### Feature 9 — Airflow Ingestion DAGs

**Service:** Airflow + ArXiv OAI-PMH + Jina AI + OpenSearch + PostgreSQL

| DAG                    | Schedule       | What it does                                                                                                                    |
| ---------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `arxiv_bulk_load`      | Once (startup) | Download Kaggle ArXiv dataset → filter cs.\* → insert into `papers` → embed abstracts → index in `arxiv-metadata`               |
| `arxiv_daily_update`   | Nightly        | Poll ArXiv OAI-PMH for new papers in cs.\* categories → insert + embed + index                                                  |
| `index_pending_papers` | Every 6 hours  | Find accepted `project_papers` or `documents` with `chunks_indexed=false` → parse PDF → chunk → embed → index in `arxiv-chunks` |
| `topic_daily_sync`     | Daily          | For each active topic → re-run `last_query` against `arxiv-metadata` → new papers not yet in project → suggest                  |
| `drift_detection`      | Weekly         | Score all accepted papers vs project topics → flag papers with similarity < 30%                                                 |

---

### Feature 10 — Observability

**Service:** Langfuse

| What is traced        | Why                                                    |
| --------------------- | ------------------------------------------------------ |
| Jina embed calls      | Track latency, cost per embedding request              |
| Ollama generate calls | Track input tokens, output tokens, latency, model used |
| Full RAG pipeline     | End-to-end trace: query in → answer out                |
| Agentic graph runs    | Each LangGraph node is a separate span                 |

Access: **http://localhost:3001** (dev) or Langfuse Cloud (production)

---

## 4. Implementation Priority

```
Phase 1 — Foundation (unblocks everything)
  ✦ models/ + Alembic migrations
  ✦ config.py + database.py + dependencies.py
  ✦ Clerk auth (dependencies + /me route)

Phase 2 — Core CRUD
  ✦ Projects API (create, list, detail, delete)
  ✦ ArXiv client (search + metadata fetch)
  ✦ Paper suggestion + accept/reject flow

Phase 3 — Indexing Pipeline
  ✦ PDF parsing (docling)
  ✦ Text chunking
  ✦ Jina AI embeddings
  ✦ OpenSearch indexing
  ✦ PDF upload → MinIO

Phase 4 — Search + Chat
  ✦ Hybrid search endpoint
  ✦ Redis caching
  ✦ RAG chat pipeline
  ✦ Chat session + message persistence

Phase 5 — Agentic + Living KB
  ✦ LangGraph nodes
  ✦ Topic management
  ✦ Sync & clean workflow

Phase 6 — Airflow + Frontend + CI/CD
  ✦ Airflow DAGs
  ✦ React pages + API layer
  ✦ GitHub Actions pipeline
```
