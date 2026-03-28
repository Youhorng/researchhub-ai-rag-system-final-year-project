# ResearchHub — Implementation Roadmap

Aligned with `SYSTEM_ARCHITECTURE.md` and `DB_SCHEMA.md`.

---

## Phase 1 — Foundation

_Unblocks everything else. Must be done first._

### 1.1 Backend Models + Migrations

- [x] `models/base.py` — `DeclarativeBase` + `TimestampMixin`
- [x] `models/user.py` — `users` + `user_preferences`
- [x] `models/project.py` — `projects` + `project_topics` + `sync_events`
- [x] `models/paper.py` — `papers` + `project_papers`
- [x] `models/document.py` — `documents`
- [x] `models/chat.py` — `chat_sessions` + `chat_messages`
- [x] Alembic init + first migration (`9caf057f3ef7_initial_schema`) → applied to PostgreSQL
- [x] Second migration (`a895d80525b0_make_user_email_nullable`) → applied

### 1.2 App Core

- [x] `config.py` — pydantic-settings, all env vars (Clerk, DB, Redis, Jina, Ollama, MinIO, OpenSearch, Langfuse)
- [x] `database.py` — SQLAlchemy engine + `get_db()` session factory + `check_db_connection()`
- [x] `exceptions.py` — domain exceptions + FastAPI exception handlers
- [x] `middlewares.py` — CORS (allow all origins) + request/response logging middleware
- [x] `dependencies.py` — `DbSession`, `AppSettings`, `get_current_user`, `CurrentUser` type aliases
- [x] `main.py` — FastAPI app with lifespan (DB check on startup, `engine.dispose()` on shutdown), routers mounted, exception handlers registered

### 1.3 Auth

- [x] `services/auth/clerk.py` — fetch + cache Clerk JWKS, verify RS256 JWT, extract `clerk_id`, `email`, `display_name`, `avatar_url`
- [x] `repositories/user_repo.py` — `get_by_clerk_id`, `upsert` (INSERT ... ON CONFLICT), auto-create `UserPreferences` on first login
- [x] `routers/auth.py` — `GET /api/v1/me` → returns `UserResponse`, creates user on first call
- [x] `routers/health.py` — `GET /api/v1/health` → DB ping, returns `{ status, db }` (no auth required)
- [x] `schemas/user.py` — `UserResponse`

**Deliverable:** Server starts, `/health` returns green, `/api/v1/me` returns user from Clerk token.

---

## Phase 2 — Project Management

_Core CRUD before any AI features._

### 2.1 Project Schemas

- [x] `schemas/project.py`:
  - `ProjectCreate` — `name`, `description`, `research_goal`, `arxiv_categories[]`, `initial_keywords[]`, `year_from`, `year_to`
  - `ProjectUpdate` — `name?`, `description?`, `status?`, `research_goal?`, `initial_keywords[]?`, `arxiv_categories[]?`, `year_from?`, `year_to?` + validator
  - `TopicUpdate` — `name?`, `keywords[]?`, `arxiv_categories[]?`, `year_from?`, `year_to?`
  - `ProjectResponse` — all `projects` columns including `paper_count`, `document_count`, `last_synced_at`, `created_at`, `updated_at`
  - `TopicCreate` — `name`, `arxiv_categories[]`, `keywords[]`, `year_from`, `year_to`
  - `TopicResponse` — all `project_topics` columns

### 2.2 Project Repository

- [x] `repositories/project_repo.py`:
  - `create(db, owner_id, **fields) -> Project`
  - `get_by_id(db, project_id) -> Project | None`
  - `list_by_owner(db, owner_id, include_archived=False) -> list[Project]`
  - `update(db, project, **fields) -> Project`
  - `delete(db, project) -> None`
  - `increment_paper_count(db, project_id, delta=1) -> None`
  - `increment_document_count(db, project_id, delta=1) -> None`

### 2.3 Topic Repository

- [x] `repositories/topic_repo.py` (combined in `project_repo.py`):
  - `create_topic(db, project_id, **fields) -> ProjectTopic`
  - `get_topic_by_id(db, topic_id) -> ProjectTopic | None`
  - `list_topics_by_project(db, project_id) -> list[ProjectTopic]`
  - `update_topic(db, topic, **fields) -> ProjectTopic`
  - `prune_topic(db, topic) -> None` — soft-delete (status → "pruned")

### 2.4 Project Service

- [x] `services/project_service.py`:
  - `create_project(db, current_user, data: ProjectCreate) -> Project`
  - `list_projects(db, current_user, include_archived=False) -> list[Project]`
  - `get_project(db, current_user, project_id) -> Project` — raises `NotFoundError` / `ForbiddenError`
  - `update_project(db, current_user, project_id, data: ProjectUpdate) -> Project`
  - `delete_project(db, current_user, project_id) -> None`
  - `add_topic(db, current_user, project_id, data: TopicCreate) -> ProjectTopic`
  - `list_topics(db, current_user, project_id) -> list[ProjectTopic]`
  - `get_topic(db, current_user, project_id, topic_id) -> ProjectTopic` — ownership + existence + not-pruned check
  - `update_topic(db, current_user, project_id, topic_id, data: TopicUpdate) -> ProjectTopic`
  - `delete_topic(db, current_user, project_id, topic_id) -> None` — soft-delete

### 2.5 Projects Router

- [x] `routers/projects.py` — mount at `/api/v1`:
  - `POST   /projects` — create project (all wizard form fields in body)
  - `GET    /projects` — list current user's projects (excludes archived by default)
  - `GET    /projects/{project_id}` — get single project detail
  - `PATCH  /projects/{project_id}` — update name/description or archive
  - `DELETE /projects/{project_id}` — hard delete (cascades in DB)
  - `POST   /projects/{project_id}/topics` — add a topic to a project
  - `GET    /projects/{project_id}/topics` — list all active topics for a project
  - `PATCH  /projects/{project_id}/topics/{topic_id}` — edit topic fields
  - `DELETE /projects/{project_id}/topics/{topic_id}` — soft-delete (status → "pruned")

- [x] `projects_router` mounted in `main.py`

**Deliverable:** Can create/list/archive/delete projects via API. Topics are saved with their search parameters. All form fields from the 5-step wizard are captured in `POST /projects`.

---

## Phase 3 — ArXiv Pre-Population (Airflow)

_Load data before users can search. `arxiv-metadata` must be populated before Phase 4 works._

### 3.1 OpenSearch Setup

- [x] `services/opensearch/client.py` — OpenSearch Python client wrapper, reads `OPENSEARCH_HOST`, `OPENSEARCH_USER`, `OPENSEARCH_PASSWORD` from settings
- [x] `services/opensearch/index_config.py`:
  - Create `arxiv-metadata` index: fields `arxiv_id`, `title`, `abstract`, `categories[]`, `published_at`, `abstract_vector` (1024-dim, cosinesimil)
  - Create `arxiv-chunks` index: fields `chunk_text`, `chunk_vector` (1024-dim), `paper_id`, `document_id`, `project_id`, `arxiv_id`, `title`
  - Register `hybrid-rrf-pipeline` (Reciprocal Rank Fusion) in OpenSearch

### 3.2 Embeddings Service

- [x] `services/embeddings/openai_embeddings.py` — call OpenAI API (`text-embedding-3-small`), returns 1024-dim float list (via `dimensions=1024`); batch support via OpenAI Batch API

### 3.3 Airflow DAGs

- [x] `airflow/dags/arxiv_bulk_load.py` (run once on startup):
  - Download Kaggle ArXiv dataset (JSON)
  - Filter: `cs.*` and `stat.ML` categories only
  - Insert rows into `papers` table (PostgreSQL) — `arxiv_id`, `title`, `authors[]`, `abstract`, `categories[]`, `published_at`, `pdf_url`
  - Embed `title + abstract` via Jina AI → index into `arxiv-metadata` OpenSearch
  - Set `papers.metadata_indexed = True`, `papers.metadata_indexed_at = now()`
- [x] `airflow/dags/arxiv_daily_update.py` (nightly):
  - Poll ArXiv OAI-PMH for new papers per cs.\* category since last run
  - Insert new rows into `papers`
  - Embed + index into `arxiv-metadata`

**Deliverable:** `arxiv-metadata` index populated with cs.\* papers. Search returns results. Both OpenSearch indices exist with correct mappings.

---

## Phase 4 — Paper Discovery + Project Creation Wizard

_The full project creation flow — requires Phase 3 to have data._

### 4.1 Keyword Extraction (Ollama)

- [x] `services/ollama/client.py` — HTTP client for Ollama `/api/generate`, reads `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT`
- [x] `services/ollama/keyword_extractor.py` — prompt Ollama to extract 8–12 candidate keywords from `research_goal` text; parse JSON list from response
- [x] `routers/projects.py` — add `POST /projects/suggest-keywords`:
  - Body: `{ "research_goal": str }`
  - Calls Ollama keyword extractor
  - Returns `{ "keywords": list[str] }`
  - No auth required before project is created, or use `CurrentUser`

### 4.2 Paper Search Service

- [x] `services/opensearch/query_builder.py` — build hybrid OpenSearch query:
  - BM25 on `title + abstract` using `initial_keywords`
  - KNN on `abstract_vector` using embedded `research_goal` (via OpenAI `text-embedding-3-small`)
  - RRF pipeline combining both
  - Hard filters: `categories` (from `arxiv_categories[]`), date range (`year_from`/`year_to`)
  - Exclude papers already in `project_papers` for this project
- [x] `services/paper_service.py`:
  - `search_and_suggest_papers(db, os_client, project, keywords, limit)` — query `arxiv-metadata`, return top-N, insert as `project_papers` with `status=suggested`
  - `discover_papers(db, os_client, project, limit)` — combined project + all active topics' keywords/categories/date range search, deduplicates, filters already-linked papers
  - `remove_paper_from_project(db, project, paper_id)` — delete OpenSearch chunks + Postgres `ProjectPaper` row + decrement `paper_count`
- [x] `repositories/paper_repo.py`:
  - `get_or_create(db, arxiv_data) -> Paper` — upsert into `papers` table by `arxiv_id`
  - `get_project_paper(db, project_id, paper_id) -> ProjectPaper | None`
  - `delete_project_paper(db, project_paper) -> None`
- [x] `schemas/paper.py`:
  - `PaperResponse` — `id`, `arxiv_id`, `title`, `authors[]`, `abstract`, `categories[]`, `published_at`, `pdf_url`
  - `ProjectPaperResponse` — `id`, `paper`, `status`, `relevance_score`, `added_by`, `added_at`
  - `PaperDiscoverRequest` — `limit` (default 20)

### 4.3 Paper Accept / Reject Endpoint

- [x] `routers/papers.py` — mount at `/api/v1`:
  - `POST   /projects/{project_id}/papers/search` — trigger paper discovery search, insert suggestions
  - `POST   /projects/{project_id}/papers/discover` — combined project + topic search ("Find Papers" button)
  - `GET    /projects/{project_id}/papers` — list papers for a project (filter by status)
  - `PATCH  /projects/{project_id}/papers/{paper_id}` — update status `suggested → accepted | rejected`
    - On `accepted`: trigger background task (4.4 below), increment `projects.paper_count`
    - On `rejected`: no side effects
  - `DELETE /projects/{project_id}/papers/{paper_id}` — remove paper + clean up OpenSearch chunks

### 4.4 Full-Text Indexing Pipeline

- [x] `services/pdf_parser/parser.py` — docling: fetch PDF from URL → extract raw text
- [x] `services/indexing/text_chunker.py` — split text into 600-char chunks with 100-char overlap, respect `min_chunk_size=100`, optionally section-based
- [x] `services/indexing/hybrid_indexer.py` — orchestrate: chunk list → batch embed via OpenAI `text-embedding-3-small` → bulk index into `arxiv-chunks` with `paper_id`, `project_id`, `arxiv_id`; set `papers.chunks_indexed = True`

### 4.5 PDF Upload

- [x] `services/storage/minio.py` — MinIO client: `upload(bucket, key, file)`, `download(bucket, key)`, `presign_url(bucket, key)`, reads `MINIO_*` settings
- [x] `repositories/document_repo.py`:
  - `create(db, project_id, **fields) -> Document`
  - `get_by_id(db, doc_id) -> Document | None`
  - `list_by_project(db, project_id) -> list[Document]`
  - `delete(db, document) -> None`
- [x] `schemas/document.py` — `DocumentResponse`: `id`, `project_id`, `title`, `original_filename`, `file_size_bytes`, `chunks_indexed`, `uploaded_at`
- [x] `routers/documents.py` — mount at `/api/v1`:
  - `POST   /projects/{project_id}/documents` — stream upload to MinIO, insert `documents` row, trigger background indexing task, increment `projects.document_count`
  - `GET    /projects/{project_id}/documents` — list with `chunks_indexed` status
  - `DELETE /projects/{project_id}/documents/{document_id}` — remove from MinIO + PostgreSQL + OpenSearch (delete by `document_id` filter)

- [x] Mount `papers_router` and `documents_router` in `main.py`

**Deliverable:** Full project creation wizard works end-to-end. User accepts/rejects papers (from `arxiv-metadata`). Uploads PDFs. Both are indexed into `arxiv-chunks`. `project_papers` and `documents` rows reflect correct status.

---

## Phase 5 — RAG Chat

_Core AI feature. Requires Phase 4 to have `arxiv-chunks` populated._

### 5.1 Hybrid Search Endpoint

- [x] `routers/search.py` — mount at `/api/v1`:
  - `POST /projects/{project_id}/search` — body `{ "query": str, "top_k": int }`
  - Embed query via OpenAI `text-embedding-3-small` → BM25 + KNN against `arxiv-chunks` scoped to `project_id` + RRF
  - Check Redis cache first; cache result with 6-hour TTL
  - Returns ranked chunk list with `paper_id`, `title`, `chunk_text`, `relevance_score`

### 5.2 RAG Pipeline

- [x] `services/rag/pipeline.py`:
  1. Embed user query (OpenAI `text-embedding-3-small`)
  2. Hybrid search `arxiv-chunks` scoped to `project_id` → top-K chunks
  3. Build prompt: `[system context] + [retrieved chunks with source labels] + [user query]`
  4. Call Ollama `/api/generate` → stream or collect response
  5. Return answer text + `cited_sources` JSON array (per `DB_SCHEMA.md` format: `paper_id`, `document_id`, `arxiv_id`, `title`, `authors[]`, `chunk_text`, `relevance_score`)
  6. Trace entire pipeline via Langfuse (embed span + generate span)

### 5.3 Chat Router

- [x] `repositories/chat_repo.py`:
  - `create_session(db, project_id, user_id, title) -> ChatSession`
  - `get_session(db, session_id) -> ChatSession | None`
  - `list_sessions(db, project_id, user_id) -> list[ChatSession]`
  - `add_message(db, session_id, role, content, cited_sources, metadata) -> ChatMessage`
  - `list_messages(db, session_id, limit, offset) -> list[ChatMessage]`
- [x] `schemas/chat.py`:
  - `ChatSessionResponse` — `id`, `project_id`, `user_id`, `title`, `created_at`, `updated_at`
  - `ChatRequest` — `message: str`
  - `ChatMessageResponse` — `id`, `session_id`, `role`, `content`, `cited_sources`, `created_at`
- [x] `routers/chat.py` — mount at `/api/v1`:
  - `POST /projects/{project_id}/chat/sessions` — create chat session
  - `GET  /projects/{project_id}/chat/sessions` — list sessions for project
  - `GET  /projects/{project_id}/chat/sessions/{session_id}/messages` — paginated history
  - `POST /projects/{project_id}/chat/sessions/{session_id}/messages` — send message → RAG pipeline → save both user + assistant turns → return `ChatMessageResponse` with `cited_sources`

### 5.4 Observability

- [x] `services/langfuse/tracer.py` — Langfuse client wrapper; `trace_span(name, input, output, metadata)` decorator for Jina embed calls and Ollama generate calls

- [x] Mount `search_router` and `chat_router` in `main.py`

**Deliverable:** Can chat with a project's papers. Answers include cited sources. Full pipeline traces visible in Langfuse at `http://localhost:3001`.

---

## Phase 6 — Agentic RAG (LangGraph)

_Enhanced reasoning pipeline. Replaces or wraps the simple RAG pipeline from Phase 5._

### 6.1 Agent State + Prompts

- [x] `services/agents/state.py` — `AgentState` TypedDict: `query`, `project_id`, `retrieved_chunks`, `graded_chunks`, `rewritten_query`, `is_in_scope`, `rewrite_count`, `node_timings`
- [x] `services/agents/prompts.py` — prompt templates for: guardrail check, document grading (batch), query rewrite, hallucination check

### 6.2 Agent Nodes

- [x] `services/agents/nodes/guardrail.py` — OpenAI gpt-4o-mini: is this query on-topic for the project? Returns `is_in_scope: bool`
- [x] `services/agents/nodes/retrieve.py` — hybrid search wrapper (same as Phase 5 search), scoped to `project_id`, returns chunks
- [x] `services/agents/nodes/grade_docs.py` — OpenAI gpt-4o-mini: batch-grade all chunks as relevant/not relevant; filter to relevant only
- [x] `services/agents/nodes/rewrite_query.py` — OpenAI gpt-4o-mini: rephrase + expand query when graded chunks are poor; re-runs retrieve node
- [x] `services/agents/nodes/hallucination_check.py` — post-generation groundedness check; stores score in message metadata

### 6.3 LangGraph Wiring

- [x] `services/agents/graph.py` — `StateGraph` wiring:
  - `guardrail` → if out of scope → END (return polite rejection message)
  - `guardrail` → if in scope → `retrieve`
  - `retrieve` → `grade_docs`
  - `grade_docs` → if relevant chunks exist → END (return graded_chunks to pipeline)
  - `grade_docs` → if no relevant chunks → `rewrite_query` → `retrieve` (max 1 retry)
- [x] Connect agentic graph to `chat.py` router — pipeline runs graph for decisions, then streams generation with existing SSE code
- [x] Trace each LangGraph node as a separate Langfuse span

**Deliverable:** Chat uses multi-step agentic pipeline. Guardrail rejects off-topic queries. Query rewriting improves recall on poor first retrieval.

---

## Phase 7 — Frontend

_React + TypeScript UI._

### 7.1 Setup + API Layer

- [ ] Install dependencies: `@clerk/clerk-react`, `react-router-dom`, `@tanstack/react-query`, `axios`, `tailwindcss`, `shadcn/ui`
- [ ] `api/client.ts` — axios instance with base URL; request interceptor attaches `Authorization: Bearer <clerk_token>` from `useAuth().getToken()`
- [ ] `api/projects.ts` — `createProject`, `listProjects`, `getProject`, `updateProject`, `deleteProject`, `addTopic`, `listTopics`, `syncTopic`
- [ ] `api/papers.ts` — `searchPapers`, `updatePaperStatus`, `suggestKeywords`
- [ ] `api/documents.ts` — `uploadDocument`, `listDocuments`, `deleteDocument`
- [ ] `api/chat.ts` — `createSession`, `listSessions`, `listMessages`, `sendMessage`
- [ ] `types/index.ts` — TypeScript types mirroring all FastAPI `*Response` schemas

### 7.2 Pages

- [ ] `pages/Dashboard.tsx` — list projects (card grid), create button, archive toggle
- [ ] `pages/ProjectDetail.tsx` — tabs: Papers, Documents, Topics, Sync History
- [ ] `pages/Chat.tsx` — chat interface left pane + citations panel right pane
- [ ] `pages/Search.tsx` — free-text hybrid search within a project, ranked results

### 7.3 Project Creation Wizard

The wizard captures the same fields as `ProjectCreate` schema across 5 steps:

- [ ] **Step 1** — Project name + description + research goal (free text)
- [ ] **Step 2** — Keyword chips: call `POST /projects/suggest-keywords` with `research_goal` → Ollama returns 8–12 suggestions → user selects/deselects + adds custom
- [ ] **Step 3** — ArXiv categories: cs.\* and stat.ML multi-checkbox grid → maps to `arxiv_categories[]`
- [ ] **Step 4** — Date range (`year_from`, `year_to`) + max paper count selector
- [ ] **Step 5** — Paper review cards (accept/reject) from `POST /projects/{id}/papers/search` result + PDF upload dropzone
  - Project is only fully created when ≥1 paper accepted or ≥1 PDF uploaded

**Deliverable:** Full working UI. Users can sign in, create projects via 5-step wizard, manage papers/documents, and chat with their knowledge base.

---

## Phase 8 — CI/CD + Deployment

_Last, when code is stable._

- [ ] `.github/workflows/ci.yml` — on PR: lint with `ruff`, run `pytest` against test DB
- [ ] `.github/workflows/cd.yml` — on merge to `main`: build Docker images + push to registry + deploy
- [ ] Populate `.env.production` with all required secrets for deployment
                                      |
---

## Service Dependency Map

```
Phase 1  →  Phase 2  →  Phase 4  →  Phase 5  →  Phase 6
                ↑              ↑
           Phase 3 (data)  Phase 4 (chunks)
                                                    ↓
                                               Phase 7 (UI)
                                                    ↓
                                               Phase 8 (CI/CD)
```

**Critical path:** Phase 3 must have `arxiv-metadata` populated before Phase 4's paper search works. Phase 4 must have `arxiv-chunks` populated before Phase 5's RAG chat works.
