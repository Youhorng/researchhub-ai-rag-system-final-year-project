# ResearchHub — Implementation Roadmap

---

## Phase 1 — Foundation

_Unblocks everything else. Must be done first._

### 1.1 Backend Models + Migrations

- [ ] `models/base.py` — DeclarativeBase + timestamp mixin
- [ ] `models/user.py` — `users` + `user_preferences`
- [ ] `models/project.py` — `projects` + `project_topics`
- [ ] `models/paper.py` — `papers` + `project_papers`
- [ ] `models/document.py` — `documents`
- [ ] `models/chat.py` — `chat_sessions` + `chat_messages` + `sync_events`
- [ ] Alembic init + first migration → apply to PostgreSQL

### 1.2 App Core

- [ ] `config.py` — pydantic-settings, all env vars
- [ ] `database.py` — SQLAlchemy engine + `get_db()` session
- [ ] `exceptions.py` — domain exceptions + FastAPI handlers
- [ ] `middlewares.py` — CORS + request logging
- [ ] `dependencies.py` — `get_db`, `get_current_user`, `get_settings`
- [ ] `main.py` — FastAPI app with lifespan, mount routers, register handlers

### 1.3 Auth

- [ ] `services/auth/clerk.py` — verify Clerk JWT → return user dict
- [ ] `repositories/user_repo.py` — `get_by_clerk_id`, `upsert`
- [ ] `routers/auth.py` — `GET /me` (create user on first login)
- [ ] `routers/health.py` — `GET /health` (DB + OpenSearch ping)

**Deliverable:** Server starts, `/health` returns green, `/me` returns user from Clerk token.

---

## Phase 2 — Project Management

_Core CRUD before any AI features._

### 2.1 Projects API

- [ ] `repositories/project_repo.py` — CRUD + list by owner
- [ ] `services/project_service.py` — create, list, get, archive, delete
- [ ] `schemas/project.py` — `ProjectCreate`, `ProjectResponse`
- [ ] `routers/projects.py` — `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`

### 2.2 Project Topics

- [ ] `repositories/topic_repo.py` — CRUD
- [ ] `routers/projects.py` — `POST /projects/{id}/topics`, `GET /projects/{id}/topics`

**Deliverable:** Can create/list/archive projects via API. Topics are saved with their search parameters.

---

## Phase 3 — ArXiv Pre-Population (Airflow)

_Load data before users can search._

### 3.1 OpenSearch Setup

- [ ] `services/opensearch/client.py` — OpenSearch client wrapper
- [ ] `services/opensearch/index_config.py` — create `arxiv-metadata` and `arxiv-chunks` indices with mappings

### 3.2 Embeddings Service

- [ ] `services/embeddings/jina.py` — text → 1024-dim vector via Jina AI API

### 3.3 Airflow DAGs

- [ ] `airflow/dags/arxiv_bulk_load.py` — one-time: Kaggle dataset → PostgreSQL → embed abstracts → `arxiv-metadata`
- [ ] `airflow/dags/arxiv_daily_update.py` — nightly: OAI-PMH → new papers → embed → `arxiv-metadata`

**Deliverable:** `arxiv-metadata` index populated with cs.\* papers. Can search by title/abstract.

---

## Phase 4 — Paper Discovery + Project Creation Wizard

_The core project creation flow._

### 4.1 Paper Search Service

- [ ] `services/opensearch/query_builder.py` — build hybrid BM25 + KNN query from form inputs
- [ ] `services/paper_service.py` — `search_by_project_form()`, `suggest_papers()`
- [ ] `repositories/paper_repo.py` — `get_or_create`, `list_by_project`, `update_status`
- [ ] `schemas/paper.py` — `PaperSearchRequest`, `PaperResponse`
- [ ] `routers/papers.py` — `POST /projects/{id}/papers/search`, `PATCH /projects/{id}/papers/{id}`

### 4.2 Full-Text Indexing Pipeline

- [ ] `services/pdf_parser/parser.py` — docling: PDF → raw text
- [ ] `services/indexing/text_chunker.py` — split text into 600-char chunks, 100-char overlap
- [ ] `services/indexing/hybrid_indexer.py` — orchestrate: chunk → embed → index into `arxiv-chunks`

### 4.3 PDF Upload

- [ ] `services/storage/minio.py` — upload, download, presign URL
- [ ] `repositories/document_repo.py` — CRUD
- [ ] `schemas/document.py` — `DocumentResponse`
- [ ] `routers/documents.py` — `POST /projects/{id}/documents`, `GET /projects/{id}/documents`, `DELETE`

**Deliverable:** Full project creation wizard works end-to-end. Accepts/rejects papers. Uploads PDFs. Both get indexed in `arxiv-chunks`.

---

## Phase 5 — RAG Chat

_Core AI feature._

### 5.1 Hybrid Search Endpoint

- [ ] `services/cache/redis.py` — get/set/delete with TTL
- [ ] `routers/search.py` — `POST /projects/{id}/search` (BM25 + KNN against `arxiv-chunks`)

### 5.2 RAG Pipeline

- [ ] `services/rag/pipeline.py` — retrieve → build prompt → Ollama generate → return with citations
- [ ] `repositories/chat_repo.py` — sessions CRUD + messages list/create
- [ ] `schemas/chat.py` — `ChatRequest`, `ChatResponse`, `MessageResponse`
- [ ] `routers/chat.py` — `POST /sessions`, `GET /sessions/{id}/messages`, `POST /sessions/{id}/messages`

### 5.3 Observability

- [ ] `services/langfuse/tracer.py` — trace decorator for embed + generate calls

**Deliverable:** Can chat with a project's papers. Answers include cited sources. Traces visible in Langfuse dashboard.

---

## Phase 6 — Agentic RAG (LangGraph)

_Enhanced reasoning pipeline._

- [ ] `services/agents/state.py` — `AgentState` TypedDict
- [ ] `services/agents/prompts.py` — prompt templates for each node
- [ ] `services/agents/nodes/guardrail.py` — topic relevance check
- [ ] `services/agents/nodes/retrieve.py` — hybrid search wrapper
- [ ] `services/agents/nodes/grade_docs.py` — relevance grading
- [ ] `services/agents/nodes/rewrite_query.py` — query expansion
- [ ] `services/agents/nodes/generate_answer.py` — final generation
- [ ] `services/agents/graph.py` — LangGraph StateGraph wiring
- [ ] Connect agentic graph to chat router

**Deliverable:** Chat uses multi-step agentic pipeline. Guardrail rejects off-topic queries. Query rewriting improves recall.

---

## Phase 7 — Living Knowledge Base

_Project stays fresh over time._

- [ ] `services/sync_service.py` — re-run `last_query` against `arxiv-metadata`, suggest new papers
- [ ] `services/drift_service.py` — score accepted papers vs topic → flag < 30% similarity
- [ ] `routers/projects.py` — `POST /projects/{id}/topics/{id}/sync`, `GET /projects/{id}/sync-events`
- [ ] `airflow/dags/topic_daily_sync.py` — automated daily sync per active topic
- [ ] `airflow/dags/drift_detection.py` — weekly drift scan

**Deliverable:** Topics can be synced manually or automatically. Low-relevance papers are flagged for removal.

---

## Phase 8 — Frontend

_React + TypeScript UI._

### 8.1 Setup

- [ ] Install: `react-router-dom`, `@clerk/clerk-react`, `@tanstack/react-query`, `axios`, `tailwindcss`, `shadcn/ui`
- [ ] `api/client.ts` — axios instance with Clerk auth header
- [ ] `api/projects.ts`, `api/papers.ts`, `api/chat.ts` — API functions
- [ ] `types/index.ts` — TypeScript types mirroring FastAPI schemas

### 8.2 Pages

- [ ] `pages/Dashboard.tsx` — project list + create button
- [ ] `pages/ProjectDetail.tsx` — papers + documents tabs
- [ ] `pages/Chat.tsx` — chat interface with citations panel
- [ ] `pages/Search.tsx` — hybrid search within a project

### 8.3 Project Creation Wizard

- [ ] Step 1: Name + research goal
- [ ] Step 2: ArXiv categories (cs.\* checkbox grid)
- [ ] Step 3: Keywords tag input
- [ ] Step 4: Date range + paper count
- [ ] Step 5: Paper review cards (accept/reject) + PDF upload
- [ ] Wizard completed → project created

**Deliverable:** Full working UI. Users can sign in, create projects, chat with papers.

---

## Phase 9 — CI/CD + Deployment

_Last, when code is stable._

- [ ] `.github/workflows/ci.yml` — on PR: lint (`ruff`), test (`pytest`)
- [ ] `.github/workflows/cd.yml` — on merge to main: build Docker images + deploy
- [ ] Populate `.env.production` values for deployment platform

---

## Summary

| Phase | What                 | Key Deliverable                          |
| ----- | -------------------- | ---------------------------------------- |
| 1     | Foundation           | Server runs, auth works, DB tables exist |
| 2     | Projects API         | Create/list/archive projects             |
| 3     | ArXiv data           | `arxiv-metadata` index populated         |
| 4     | Discovery + Indexing | Full project creation wizard works       |
| 5     | RAG Chat             | Chat with papers, citations shown        |
| 6     | Agentic RAG          | Smarter reasoning, guardrails            |
| 7     | Living KB            | Topics sync, drift detection             |
| 8     | Frontend             | React UI complete                        |
| 9     | CI/CD                | Automated tests + deployment             |
