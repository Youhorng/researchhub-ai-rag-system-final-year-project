# ResearchHub AI RAG System — Codebase Report

## Methodology

The system is built around a single, well-defined approach to question answering over a research corpus: agentic hybrid retrieval-augmented generation over a user-curated, continuously-updated knowledge base. This section explains what that means in plain terms, why each piece was chosen, and what the system deliberately does not attempt.

### The core idea

Large language models are fluent but unreliable on specialist topics. They confidently invent citations, misremember details, and cannot reference papers published after their training cutoff. Retrieval-augmented generation addresses this by giving the model a fresh, domain-specific context at query time. Instead of asking the model what it knows about a topic, the system first retrieves a handful of relevant passages from a trusted corpus and then asks the model to answer the question using those passages. The model's job shifts from recall to synthesis.

ResearchHub applies this idea to academic research. Each user curates a project, which is a collection of arXiv papers and uploaded PDFs the user considers authoritative for their topic, and then asks questions that the system answers using only passages from that curated set. Because the model is grounded in passages the user explicitly chose, hallucination is limited by construction. The system can only cite what the user has vouched for.

### Hybrid retrieval

Retrieval is the quality bottleneck of any RAG system. If the wrong passages are fetched, no amount of model capability can save the answer. The project uses hybrid retrieval, which combines two complementary signals.

The first signal is keyword matching, implemented with the classical BM25 algorithm. BM25 scores passages by how often a query's words appear in them, weighted by how rare those words are across the whole corpus. It is excellent at exact matches, including author names, equation symbols, acronyms, and specific technical terms that have no meaningful vector representation.

The second signal is dense vector similarity. Every passage in the corpus is converted into a 1024-dimensional numerical vector using an embedding model, and so is the user's query. The system then finds passages whose vectors point in a similar direction to the query's vector, which is a measure of semantic similarity. This captures the meaning of a question even when the exact words do not match. A query about transformers can surface passages about attention mechanisms without needing the exact term to appear.

These two ranked lists are combined using Reciprocal Rank Fusion, a well-studied fusion method that weights results by their rank position in each list rather than by raw scores. The outcome is a single ranked list that benefits from both keyword precision and semantic recall, without either signal dominating the other. This is a deliberate choice. A pure vector system would be simpler to build but would miss exact terms. A pure keyword system would miss paraphrases. Hybrid retrieval sidesteps both failure modes.

### Agentic pipeline

Simple RAG runs a single retrieval, feeds the results to the model, and hopes for the best. The project goes further by treating retrieval as a multi-step decision process — a small state machine in which each step is driven by the language model itself. The pipeline has four roles.

A guardrail step first checks whether the user's question is even within the scope of the project's research goal. If someone asks a project about reinforcement learning how to bake a cake, the system recognises the mismatch immediately and returns a short refusal rather than wasting retrieval effort and risking an off-topic answer. The guardrail also detects simple greetings and small talk, routing them to a lightweight conversational response instead of the full pipeline.

A retrieval step then runs the hybrid search described above, scoped strictly to the passages belonging to the current project. Global noise is excluded at the filter level, not the ranking level. The system physically cannot return passages from papers the user has not accepted into the project.

A grading step takes the retrieved passages and asks the language model, one passage at a time, whether each is actually relevant to the question. This is a deliberate safeguard against retrieval errors. Hybrid search is good but not perfect, and a chunk that happened to share keywords with the query is not necessarily useful for answering it. The model acts as a critic, discarding passages that would only contribute noise.

A query rewriting step runs if grading discards everything. When no graded passages survive, the model rewrites the original query to be clearer or more specific, and the pipeline loops back to retrieve once more. This single retry catches the common case where the user's phrasing is ambiguous or uses vocabulary that does not match the corpus. The loop is capped at one retry to keep latency predictable.

Only after these steps does the system build a prompt and generate an answer. The model sees the question, the recent conversation history, and the surviving graded passages, and is instructed to answer using only the information provided, citing passages by number wherever they support a claim. The answer is streamed back to the user token by token, and once generation finishes, the citation markers in the text are matched against the source passages and emitted as a structured list, so the interface can render each citation as a clickable reference to its original paper or document.

This style of pipeline, with retrieval followed by self-evaluation and conditional rewriting, is known in the literature as Corrective RAG. It is the system's main defence against the two biggest failure modes of naive RAG: irrelevant retrieval and confident hallucination.

### Living Knowledge Base

A research corpus is not static. New papers appear every day, and a system that indexes a snapshot once and never updates quickly becomes stale. ResearchHub addresses this by treating the corpus as a Living Knowledge Base, one that grows alongside the research it is meant to support.

Each project can define any number of topics, where a topic is a persistent description of what the user cares about: a set of arXiv categories, a list of keywords, and an optional year range. A scheduled background job periodically fetches new arXiv papers, checks which ones match each topic's query, and surfaces them to the user for review as suggestions. The user accepts the ones they find relevant and rejects the rest. Accepted papers are then downloaded, parsed, chunked, embedded, and indexed automatically, becoming immediately available for future queries.

This preserves the human-in-the-loop guarantee, since the user still decides what enters the corpus, while removing the manual labour of keeping the corpus current. The audit trail of sync events makes the curation history inspectable, which matters for any research workflow that needs to be reproducible.

### Why these choices

Each methodological choice answers a specific failure mode.

Hybrid retrieval exists because pure vector search misses exact terms and pure keyword search misses paraphrases. Using both gives robust recall without either weakness dominating.

The guardrail exists because off-topic queries are the easiest path to hallucination. If the corpus has nothing relevant, a naive system will either refuse unhelpfully or invent an answer. Explicit scope-checking stops this at the door.

The grading step exists because hybrid retrieval can still return passages that share vocabulary with the query but are not useful for answering it. A separate relevance check, performed by a language model, is cheap insurance against feeding noise into the generator.

The query rewrite loop exists because user phrasings are often the root cause of retrieval failure, not the corpus itself. Allowing one rewrite recovers a surprising fraction of failed queries without significantly increasing latency.

User-curated scoping exists because the most reliable way to prevent a RAG system from citing junk is to not have junk in the corpus in the first place. The user, not the system, decides what counts as authoritative.

The Living Knowledge Base exists because static corpora go stale fast in an active research area, and because pushing the user to manually re-upload every new paper defeats the point of automation.

### What the system is not

It helps to be explicit about methodological choices the project deliberately did not make, since a reader could reasonably assume otherwise.

The project does not fine-tune or train any language model. The methodology operates entirely at the retrieval and prompting layer, and model weights are used as they are.

The project is not a knowledge graph system. Retrieval is flat: passages are treated as independent units and ranked individually. There is no entity-relation graph, no graph traversal, and no structured reasoning over linked concepts.

The project does not use a trained cross-encoder reranker. The re-ranking step is performed by prompting a language model to judge relevance, which is simpler to implement and tune but slower and more expensive per query than a dedicated reranker model would be.

The project is not multi-agent. It uses a single pipeline with multiple language model calls playing different roles, but there is no cooperation between independent agents and no open-ended tool-calling loop. The agent's topology is fixed, not emergent.

The project does not perform post-generation fact verification against the source passages. A hallucination-check step exists in the pipeline scaffolding but is not currently implemented, meaning the system trusts its own citations without cross-checking them against the retrieved text. This is a known gap and a natural direction for future work.

### Summary

In one sentence, the methodology is agentic hybrid retrieval-augmented generation over a user-curated, continuously-updated research corpus, where a small language-model-driven state machine performs scope checking, hybrid keyword-plus-vector retrieval, relevance grading, optional query rewriting, and grounded answer generation with explicit citations, applied to the domain of academic research discovery over arXiv.

---

## 1. Project Structure

### 1.1 Monolith Boundaries

This repo is a **single-repo polyglot monolith** split cleanly along two top-level folders:

- `frontend/` — React 19 + TypeScript SPA, built with Vite, served by Nginx in production.
- `backend/` — FastAPI (Python 3.12) service with SQLAlchemy, plus an Airflow submodule that shares `backend/src/` via volume mount.

There is no shared language/runtime between the two sides; communication is purely HTTP (REST + SSE) over `/api/v1/*`. Nginx at the edge multiplexes `/api/*` → backend and everything else → frontend.

### 1.2 Root Directory Tree

```
researchhub-ai-rag-system/
├── backend/
│   ├── src/                  # FastAPI application source
│   │   ├── main.py           # App init, lifespan, middleware, router mount
│   │   ├── config.py         # Pydantic settings (nested __ delimiter)
│   │   ├── database.py       # SQLAlchemy engine/session
│   │   ├── dependencies.py   # DI: DbSession, CurrentUser, OsClient, AppSettings
│   │   ├── middlewares.py    # CORS + request logging
│   │   ├── exceptions.py     # Custom exceptions + handlers
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response DTOs
│   │   ├── repositories/     # Data-access layer (pure CRUD, no business logic)
│   │   ├── routers/          # HTTP handlers, 1 file per domain
│   │   └── services/         # Business logic + external integrations
│   │       ├── rag/          # pipeline.py — streaming SSE orchestrator
│   │       ├── agents/       # LangGraph graph + nodes/
│   │       ├── opensearch/   # query_builder, index_config
│   │       ├── embeddings/   # OpenAI text-embedding-3-small
│   │       ├── indexing/     # document_indexer, hybrid_indexer, text_chunker
│   │       ├── pdf_parser/   # PyMuPDF + Docling
│   │       ├── storage/      # MinIO client
│   │       ├── auth/         # Clerk JWT verification (JWKS)
│   │       ├── llm/          # openai_chat, keyword_extractor
│   │       └── langfuse/     # Observability tracer
│   ├── alembic/              # Migrations (4 revisions)
│   ├── airflow/              # DAGs share backend/src/ by volume mount
│   │   ├── dags/             # arxiv_bulk_load_batch, arxiv_daily_update
│   │   ├── plugins/
│   │   └── data/
│   ├── tests/                # pytest suite (sparse)
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.tsx          # ClerkProvider + BrowserRouter entry
│   │   ├── App.tsx           # Route definitions
│   │   ├── pages/            # 14 page components
│   │   │   ├── LandingPage / SignInPage / SignUpPage / DashboardPage / ProjectsPage
│   │   │   ├── dashboard/    # ExplorePage, ActivityPage, AnalyticsPage, PaperDetailPage
│   │   │   └── project/      # ProjectDashboardPage, KnowledgeBasePage, TopicsPage,
│   │   │                       ChatPage, SettingsPage
│   │   ├── layouts/          # AuthLayout, DashboardLayout, ProjectLayout
│   │   ├── components/       # modals/ (NewProjectModal, NewTopicModal, AddToProjectModal)
│   │   └── assets/
│   ├── vite.config.ts
│   ├── package.json
│   └── Dockerfile            # multi-stage: node build → nginx:1.27-alpine
├── nginx/
│   └── nginx.conf            # Edge reverse proxy (SSL, SSE passthrough)
├── scripts/
│   ├── 01_create_databases.sh
│   └── deploy.sh
├── docs/
├── opensearch-snapshots/
├── compose.yml               # Primary Docker Compose (dev+prod)
├── compose.prod.yml          # Production overrides
├── Makefile                  # Top-level automation
├── pyrightconfig.json
├── sonar-project.properties
├── CLAUDE.md                 # Project instructions for Claude Code
└── README.md
```

### 1.3 Config Files

| File | Purpose |
|---|---|
| `compose.yml` | Dev compose stack: api, frontend, postgres, redis, opensearch, opensearch-dashboards, minio, airflow |
| `compose.prod.yml` | Production overrides |
| `Makefile` | `make start/stop/status/logs/logs-api/health`; delegates backend targets |
| `backend/Makefile` | `setup`, `format` (ruff), `lint` (ruff + mypy), `test`, `test-cov`, `db-migrate/upgrade/downgrade/history` |
| `backend/pyproject.toml` | Python deps (uv-managed), ruff, mypy config |
| `frontend/package.json` | npm deps; scripts `dev`, `build` (`tsc -b && vite build`), `lint` |
| `frontend/vite.config.ts` | Vite build config |
| `nginx/nginx.conf` | TLS termination, SSE passthrough, Cloudflare real IP |
| `pyrightconfig.json` | Pyright type-check config |
| `sonar-project.properties` | SonarQube code quality |
| `.env.example` | Template for all env vars |
| `.github/workflows/deploy.yml` | CI/CD deploy pipeline on push to main |

### 1.4 Architectural Patterns

- **Layered / Clean-ish:** routers → services → repositories → ORM → DB. Routers never touch the DB directly except via repositories.
- **Dependency Injection:** FastAPI `Depends()` throughout; `CurrentUser`, `DbSession`, `OsClient`, `AppSettings` are `Annotated` aliases.
- **Agentic RAG:** LangGraph state machine with guardrail → retrieve → grade → optional rewrite → generate.
- **Event streaming:** Server-Sent Events (SSE) via `sse-starlette` for chat; Nginx configured with `proxy_buffering off`.
- **Background tasks:** Indexing uses FastAPI `BackgroundTask` post-response (no Celery/Redis queue).
- **Denormalized counters:** `Project.paper_count`, `Project.document_count` maintained manually at accept/reject/upload/delete boundaries.
- **Repository pattern:** Pure CRUD in `repositories/`, business logic in `services/`.

---

## 2. Tech Stack & Dependencies

### 2.1 Backend Dependencies

| Library | Role |
|---|---|
| **fastapi** | Async web framework |
| **sqlalchemy 2.x** | ORM |
| **alembic** | Schema migrations |
| **pydantic / pydantic-settings** | Validation + settings |
| **opensearch-py** | Vector/BM25 index client |
| **openai** | Embeddings (`text-embedding-3-small`, 1024 dim) + chat (`gpt-4o-mini`) |
| **langgraph** | Agent state machine for RAG |
| **langfuse** | LLM tracing/observability |
| **minio** | S3-compatible object storage SDK |
| **pymupdf** + **docling** | PDF parsing |
| **sse-starlette** | SSE streaming responses |
| **PyJWT + cryptography** | Clerk JWT verification (RS256 via JWKS) |
| **redis** | Caching |
| **uvicorn** | ASGI server |
| **ruff + mypy + pytest** | Tooling |

### 2.2 Frontend Dependencies

| Library | Role |
|---|---|
| **react 19.2** | UI framework |
| **react-router 7** | SPA routing |
| **vite 7** | Build + dev server |
| **@clerk/clerk-react** | Auth (JWT issuance, hosted sign-in/up UI) |
| **react-markdown + remark-gfm + remark-math + rehype-katex** | Markdown rendering with LaTeX in chat |
| **katex** | Math typesetting |
| **recharts** | Charts on AnalyticsPage |
| **lucide-react** | Icons |
| **tailwindcss + postcss** | Styling |

**No global state library** (no Redux, Zustand, Jotai). State lives in page components and is passed via React Router `Outlet` context in `ProjectLayout`.

**No API client abstraction** — raw `fetch()` calls are scattered across pages/components with manual `Authorization: Bearer` headers from `useAuth().getToken()`. This is a notable consistency risk (see Section 9).

### 2.3 Docker Services (`compose.yml`)

| Service | Image | Ports | Depends On | Volumes |
|---|---|---|---|---|
| `api` | built from `backend/Dockerfile` | 8000 | postgres, opensearch, redis, minio | — (code baked in) |
| `frontend` | built from `frontend/Dockerfile` | 3000 | — | — |
| `postgres` | `postgres:16` | 5432 | — | `postgres_data` + init script `scripts/01_create_databases.sh` |
| `redis` | `redis:7` | 6379 | — | `redis_data` |
| `opensearch` | `opensearchproject/opensearch:2.19.0` | 9200, 9600 | — | `opensearch_data` |
| `opensearch-dashboards` | `opensearchproject/opensearch-dashboards:2.19.0` | 5601 | opensearch | — |
| `minio` | `minio/minio` | 9002 (API), 9003 (console) | — | `minio_data` |
| `airflow` | Airflow image | 8080 | postgres (airflow_db) | `airflow_logs` + bind-mount `backend/airflow/dags/` + `backend/src/` |

Network: `rag-network` (bridge).

**Critical invariant documented in CLAUDE.md:** The API container bakes source at build time — **live mount is not used**. Every backend change requires `docker compose up --build -d api`.

### 2.4 CI/CD

`.github/workflows/deploy.yml` triggers on push to `main`: build images → push → deploy via `scripts/deploy.sh`. Health check post-deploy. No separate staging environment observed in configs.

### 2.5 Third-Party Integrations

- **Clerk** — Authentication (hosted UI + JWT issuance + JWKS verification)
- **OpenAI** — Embeddings + chat completions
- **Langfuse** — LLM observability (cloud-hosted, optional via `LANGFUSE__ENABLED`)
- **Cloudflare** — DNS + Origin Certificate (Full Strict TLS)
- **arXiv** — Paper metadata + PDFs (via OAI-PMH and direct fetch)

---

## 3. Database

### 3.1 PostgreSQL Schema

Database: `rag_db` (a second database `airflow_db` lives in the same instance for Airflow metadata, created by `scripts/01_create_databases.sh`).

Migrations directory: `backend/alembic/versions/` — **4 revisions**:
1. `9caf057f3ef7_initial_schema.py`
2. `a895d80525b0_make_user_email_nullable.py`
3. `c3f8a1b2d4e6_add_openai_batch_id_to_papers.py`
4. `d1e2f3a4b5c6_add_chunks_indexing_failed_to_papers.py`

Alembic config: `backend/alembic.ini` + `backend/alembic/env.py`.

#### Table: `users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `clerk_id` | str | UNIQUE, INDEX — maps to Clerk JWT `sub` |
| `email` | str | UNIQUE, INDEX, nullable |
| `display_name` | str | nullable |
| `avatar_url` | str | nullable |
| `created_at` | TIMESTAMPTZ | server default |
| `updated_at` | TIMESTAMPTZ | server default + onupdate |

Relationships: 1:1 `user_preferences`, 1:N `projects`, 1:N `chat_sessions` (all cascade delete).

#### Table: `user_preferences`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK→users, UNIQUE (enforces 1:1) |
| `theme` | str | default `system` |
| `default_llm_model` | str | nullable |
| `email_notifications` | bool | default true |
| `updated_at` | TIMESTAMPTZ | server default + onupdate |

#### Table: `projects`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `owner_id` | UUID | FK→users, INDEX |
| `name` | str | required |
| `description` | str | nullable |
| `research_goal` | str | nullable — embedded for initial paper discovery |
| `arxiv_categories` | ARRAY(str) | e.g. `["cs.AI", "cs.LG"]` |
| `initial_keywords` | ARRAY(str) |  |
| `year_from`, `year_to` | int | nullable |
| `status` | str | `active` \| `archived` |
| `paper_count` | int | denormalized; maintained on accept/reject |
| `document_count` | int | denormalized; maintained on upload/delete |
| `last_synced_at` | TIMESTAMPTZ | nullable |
| `created_at`, `updated_at` | TIMESTAMPTZ |  |

Cascade-delete relationships: `topics`, `project_papers`, `documents`, `chat_sessions`, `sync_events`.

#### Table: `project_topics`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK→projects, INDEX |
| `name` | str |  |
| `arxiv_categories` | ARRAY(str) | nullable |
| `keywords` | ARRAY(str) | nullable |
| `year_from`, `year_to` | int | nullable |
| `last_query` | str | nullable — saved OpenSearch query for next sync |
| `status` | str | `active` \| `pruned` |
| `added_at` | TIMESTAMPTZ |  |
| `pruned_at` | TIMESTAMPTZ | nullable |

#### Table: `sync_events`

Immutable audit log for topic/project sync operations.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK, INDEX |
| `topic_id` | UUID | FK, nullable |
| `event_type` | str | `sync` \| `clean` \| `drift_detected` |
| `papers_added`, `papers_removed` | int | default 0 |
| `details` | JSONB | nullable |
| `triggered_by` | str | `user` \| `scheduler`, nullable |
| `created_at` | TIMESTAMPTZ |  |

#### Table: `papers` (global catalog, shared across projects)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `arxiv_id` | str | UNIQUE, INDEX |
| `title` | str |  |
| `authors` | ARRAY(str) |  |
| `abstract` | str | nullable |
| `categories` | ARRAY(str) |  |
| `published_at` | DATE | nullable |
| `pdf_url` | str | nullable |
| `metadata_indexed` | bool | — indexed in `arxiv-papers` |
| `chunks_indexed` | bool | — indexed in chunks index |
| `chunks_indexing_failed` | bool | failure flag (rev `d1e2f3a4b5c6`) |
| `metadata_indexed_at`, `chunks_indexed_at` | TIMESTAMPTZ | nullable |
| `openai_batch_id` | str | nullable (rev `c3f8a1b2d4e6`) — OpenAI Batch API submission ID |
| `created_at`, `updated_at` | TIMESTAMPTZ |  |

#### Table: `project_papers` (junction with state)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK, INDEX |
| `paper_id` | UUID | FK, INDEX |
| `topic_id` | UUID | FK, nullable — which topic surfaced this paper |
| `status` | str | `suggested` \| `accepted` \| `rejected` |
| `relevance_score` | float | 0.0–1.0, from hybrid search |
| `added_by` | str | `starter_pack` \| `sync` \| `user_search`, nullable |
| `status_updated_at` | TIMESTAMPTZ | nullable |
| `added_at` | TIMESTAMPTZ |  |

#### Table: `documents`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK, INDEX |
| `title` | str |  |
| `original_filename` | str |  |
| `minio_bucket` | str |  |
| `minio_key` | str | `{project_id}/{doc_id}/{filename}` |
| `file_size_bytes` | BIGINT | nullable |
| `mime_type` | str | nullable |
| `chunks_indexed` | bool |  |
| `chunks_indexed_at` | TIMESTAMPTZ | nullable |
| `uploaded_at` | TIMESTAMPTZ |  |

#### Table: `chat_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK, nullable, INDEX |
| `user_id` | UUID | FK, INDEX |
| `title` | str | nullable — auto-set from first message (first 80 chars) |
| `created_at`, `updated_at` | TIMESTAMPTZ |  |

Cascade-delete messages.

#### Table: `chat_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `session_id` | UUID | FK, INDEX |
| `role` | str | `user` \| `assistant` |
| `content` | str | 1–4000 chars (validated in schema) |
| `cited_sources` | JSONB | `[{paper_id, document_id, arxiv_id, title, index}, ...]` |
| `metadata` | JSONB | `{model, latency_ms, input_tokens, output_tokens, ...}` |
| `created_at` | TIMESTAMPTZ |  |

### 3.2 OpenSearch Indices

| Index | Purpose |
|---|---|
| `arxiv-papers` (alias of `arxiv-papers-v2`) | Metadata + abstract embeddings for ~702k arXiv papers |
| `arxiv-papers-chunks` | Text chunks of accepted papers **and** uploaded documents |

**`arxiv-papers` mapping:**
- `arxiv_id` keyword, `title` text, `abstract` text, `authors` keyword[]
- `categories` keyword (must be keyword, not text — auto-create bug noted in CLAUDE.md)
- `published_at` date
- `abstract_vector` knn_vector (1024-dim, `cosinesimil`)
- ~28k papers have no vector (zero-vector stripped during reindex because `cosinesimil` rejects zero vectors)

**`arxiv-papers-chunks` mapping:**
- `chunk_text` text, `chunk_vector` knn_vector (1024-dim, `cosinesimil`)
- `paper_id`, `document_id`, `project_id`, `arxiv_id`, `title` — all keyword (for term filtering)

**Pipeline:** `hybrid-rrf-pipeline` (Reciprocal Rank Fusion with min-max normalization, weights [0.5, 0.5]) for combining BM25 and k-NN results.

### 3.3 Seed Data

No structured seed fixtures. Paper ingestion happens via Airflow DAGs (see Section 6).

---

## 4. Backend Logic

### 4.1 API Endpoints

All routes are prefixed `/api/v1/`. Authentication via `CurrentUser` dependency unless noted.

#### `routers/auth.py`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/me` | yes | Return current user (upserts on first call) |

#### `routers/health.py`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | no | Liveness/dependency check |

#### `routers/projects.py`

| Method | Path | Purpose |
|---|---|---|
| POST | `/projects` | Create project |
| GET | `/projects` | List (query `include_archived=false`) |
| GET | `/projects/{project_id}` | Fetch one |
| PATCH | `/projects/{project_id}` | Update |
| DELETE | `/projects/{project_id}` | Delete (cascade) |
| POST | `/projects/{project_id}/topics` | Create topic |
| GET | `/projects/{project_id}/topics` | List topics |
| PATCH | `/projects/{project_id}/topics/{topic_id}` | Update topic |
| DELETE | `/projects/{project_id}/topics/{topic_id}` | Delete topic |
| POST | `/projects/suggest-keywords` | LLM keyword extraction from research goal |

#### `routers/papers.py` (scoped `/projects/{project_id}`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/papers/add` | Add a paper (from Explore or discovery) |
| POST | `/papers/search` | Search within project papers |
| POST | `/papers/discover` | Initial starter-pack search using research_goal |
| GET | `/papers` | List project papers |
| PATCH | `/papers/{paper_id}` | Update status (suggested→accepted / rejected) |
| DELETE | `/papers/{paper_id}` | Remove |

#### `routers/documents.py`

| Method | Path | Purpose |
|---|---|---|
| POST | `/projects/{project_id}/documents` | Upload PDF (multipart). **Validation: PDF only, 5 MB max** |
| GET | `/projects/{project_id}/documents` | List |
| DELETE | `/projects/{project_id}/documents/{document_id}` | Delete (MinIO + OpenSearch + DB) |

#### `routers/chat.py` (`/projects/{project_id}/chat`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/sessions` | Create session (rate limit: **5/day/user**) |
| GET | `/sessions` | List |
| DELETE | `/sessions/{session_id}` | Delete |
| GET | `/sessions/{session_id}/messages` | Paginated messages (limit 1–200 default 50) |
| POST | `/sessions/{session_id}/messages` | **Send message → SSE stream** (content 1–4000 chars) |
| DELETE | `/sessions/{session_id}/messages/{message_id}` | Delete message |

#### `routers/explore.py`

| Method | Path | Purpose |
|---|---|---|
| GET | `/explore/search` | Global ArXiv catalog search (BM25-only) |

Query params: `q`, `categories`, `year_from`, `year_to`, `page`, `limit`.

> **Note:** Explore is BM25-only because `script_score` over 702k × 1024-dim vectors is too slow for global search. Semantic scoring is only used inside project-scoped paths.

#### `routers/search.py`

| Method | Path | Purpose |
|---|---|---|
| POST | `/search/chunks` | Hybrid chunk search — used internally by the RAG retrieve node |

#### `routers/activity.py`

| Method | Path | Purpose |
|---|---|---|
| GET | `/activity` | Paginated activity feed |
| GET | `/activity/recent-sessions` | "Continue where you left off" |

#### `routers/analytics.py`

| Method | Path | Purpose |
|---|---|---|
| GET | `/analytics/overview` | Totals |
| GET | `/analytics/papers-over-time` | Time series |
| GET | `/analytics/chat-activity` | Chat time series |
| GET | `/analytics/papers-by-category` | Category histogram |
| GET | `/analytics/papers-by-project` | Per-project bar |

### 4.2 Authentication & Authorization

**Flow** (`backend/src/services/auth/clerk.py` + `backend/src/dependencies.py`):

1. Frontend obtains JWT via `useAuth().getToken()` from Clerk.
2. Request arrives with `Authorization: Bearer <jwt>`.
3. `get_current_user()` dependency:
   a. Extracts token from header.
   b. Calls `verify_clerk_token(token)` — downloads JWKS from `CLERK_JWKS_URL` (cached in-process), verifies RS256 signature.
   c. Extracts claims: `sub`, `email`, `name`, `image_url`.
   d. Calls `user_repo.upsert()` to get-or-create the `users` row.
4. Endpoint receives the hydrated `User` ORM object via `CurrentUser` Annotated alias.

**Authorization** is **implicit ownership-based**: every project-scoped handler re-fetches the project and compares `project.owner_id` to `current_user.id`. There is no ACL / sharing / team model — owner is the sole principal.

### 4.3 Validation

- **Pydantic schemas** in `backend/src/schemas/` validate all request bodies and serialize responses.
- Chat message content: `Field(min_length=1, max_length=4000)`.
- Document upload: PDF mime-type check + 5 MB size guard in `documents.py`.
- Pagination: `limit ∈ [1, 200]`, `offset ≥ 0`.
- **Gaps:** ArXiv categories are not validated server-side against a known list; `year_from ≤ year_to` is not enforced; `project.name` has no max length; nginx `client_max_body_size` is 55m — larger than the app-level 5 MB guard, so the app enforces the tighter bound.

### 4.4 Core Business Rules

- **Denormalized counts:** `Project.paper_count` / `document_count` are incremented/decremented on accept/reject and upload/delete — they are *not* computed with subqueries.
- **Chat session title auto-fill:** If title is null on first message, set to `content[:80]`.
- **Paper status state machine:** `suggested → accepted | rejected`. Chunks are only indexed when a paper becomes `accepted`.
- **Chat rate limit:** 5 sessions per day per user (enforced in router).
- **Zero vectors:** Stripped during reindex because `cosinesimil` rejects them.

### 4.5 Error Handling

- `backend/src/exceptions.py` defines custom exceptions (`NotFoundError`, `ForbiddenError`, etc.) registered as FastAPI exception handlers that return JSON with a stable envelope.
- HTTP codes used: 400, 401, 403, 404, 409, 422, 500.
- Generic, non-leaky error messages to the client; full stack traces to logs.

### 4.6 Background Jobs & Scheduling

- **In-process background tasks:** FastAPI `BackgroundTask` is used to index documents/paper chunks *after* the HTTP response is sent. There is **no Celery or Redis queue** — if the API container restarts mid-task, work is silently lost.
- **Airflow:** Scheduled ingestion of arXiv papers (see Section 6).
- **Redis** is used only for caching, not as a task queue.

---

## 5. Frontend Logic

### 5.1 Routing & Layouts

`frontend/src/App.tsx` defines routes using React Router 7. `frontend/src/main.tsx` wraps the whole app in `<ClerkProvider>` and `<BrowserRouter>`.

- **`AuthLayout`** — hosts public routes (Landing, SignIn, SignUp).
- **`DashboardLayout`** — top-level authenticated shell with collapsible sidebar. Renders `<NewProjectModal />` and `<Outlet />`. Hosts `DashboardPage`, `ProjectsPage`, and `/dashboard/*` pages.
- **`ProjectLayout`** — per-project shell. Fetches the project via `GET /projects/{id}` and passes it into nested routes through the React Router `Outlet` context. Hosts `/project/:id/*` pages.

Pages (see Section 1.2 for the file list): Landing, SignIn, SignUp, Dashboard, Projects, Explore, Activity, Analytics, PaperDetail, ProjectDashboard, KnowledgeBase, Topics, Chat, Settings.

### 5.2 API Communication

**Pattern:** Raw `fetch()` calls directly inside components, using an env var (`VITE_API_URL`) and manual auth header injection:

```ts
const { getToken } = useAuth();
const token = await getToken();
const res = await fetch(`${apiUrl}/projects`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
});
```

There is **no shared client** (no axios instance, no SWR/React Query). This is a consistency risk — auth headers, error handling, and loading states are re-implemented per component.

**SSE streaming (ChatPage):**

```ts
const response = await fetch(`${apiUrl}/projects/${pid}/chat/sessions/${sid}/messages`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ content }),
});
const reader = response.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // parse SSE "data: {...}" frames → chunk | citations | done | error
}
```

### 5.3 State Management

- No global state library.
- Local state via `useState` in pages.
- Cross-page state via `ProjectLayout` outlet context.
- Modal state is scattered; `NewProjectModal` lives at the `DashboardLayout` level so every dashboard page can trigger it.

### 5.4 Forms & Client Validation

- Plain controlled inputs, no Formik/React Hook Form.
- Client-side validation is minimal (required fields, non-empty checks).
- Server is the source of truth for validation.

### 5.5 Auth Tokens

- Clerk owns the session; tokens are fetched on demand via `useAuth().getToken()` (no manual storage).
- Protected routes are gated via Clerk's `<SignedIn>` / `<SignedOut>` or redirect logic in layouts.

---

## 6. Airflow (Scheduled Pipelines)

DAGs live at `backend/airflow/dags/` and share `backend/src/` via bind mount, so they call the same service layer as the API.

### 6.1 `arxiv_bulk_load_batch.py`

- **Trigger:** Manual.
- **Purpose:** Bulk-load arXiv paper embeddings using the OpenAI **Batch API**.
- **Tasks:** Page through `papers` WHERE `metadata_indexed=false` (page 5k) → build OpenAI batch (up to 4000 requests) → submit → poll up to 24h → download embeddings → bulk-index into `arxiv-papers` (500-doc chunks) → set `metadata_indexed=true` and `openai_batch_id`.

### 6.2 `arxiv_daily_update.py`

- **Trigger:** Daily.
- **Purpose:** Fetch new arXiv papers (OAI-PMH), filter by configured categories, insert into `papers`, and schedule indexing.
- **Includes:** Drift detection and optional cleanup logic that flags low-relevance papers via `sync_events`.

---

## 7. RAG Pipeline (Core Feature)

### 7.1 Orchestrator — `services/rag/pipeline.py`

`run_rag_pipeline()` is an async generator producing SSE events. Flow:

1. **Persist user message** to `chat_messages` (role=`user`).
2. **Load last 10 messages** as conversation history.
3. **Invoke LangGraph agent** with initial `AgentState`:
   ```python
   { "query", "project_id", "paper_ids", "research_goal",
     "initial_keywords", "conversation_history",
     "is_in_scope", "is_conversational", "rejection_message",
     "retrieved_chunks", "graded_chunks", "rewrite_count",
     "rewritten_query", "node_timings" }
   ```
4. If `is_in_scope=False` → yield a rejection SSE and return.
5. If `is_conversational=True` (simple greeting) → skip retrieval, call LLM directly.
6. Otherwise build system prompt from `graded_chunks` and stream OpenAI chat completion token-by-token.
7. Extract `[N]` citations from streamed content, **renumber** so indices are contiguous (1..K), yield a `citations` event, then a `done` event.
8. Fire a (non-blocking) hallucination check trace span.
9. Persist assistant message with `cited_sources` and `metadata` (model, latency_ms, token counts).

**SSE event types:** `chunk`, `citations`, `done`, `error`.

### 7.2 LangGraph — `services/agents/graph.py` + `nodes/`

```
guardrail ──[in_scope & !conversational]──▶ retrieve ──▶ grade_docs
                                                             │
                     ┌───────────────────────────────────────┤
                     ▼                                       ▼
               rewrite_query ──▶ retrieve              END (graded_chunks)
               (max 1 rewrite)
```

- **`guardrail.py`** — LLM checks query vs. `research_goal`; sets `is_in_scope` and `is_conversational`.
- **`retrieve.py`** — Embeds query, calls OpenSearch hybrid (BM25 + k-NN) on `arxiv-papers-chunks`, filtered by `paper_ids` (accepted papers) OR `project_id` (uploaded docs). Returns top 8.
- **`grade_docs.py`** — LLM re-ranks chunks, returns only relevant ones.
- **`rewrite_query.py`** — If `graded_chunks` empty and `rewrite_count < 1`, rewrite and loop back to retrieve.

### 7.3 OpenSearch Hybrid Query — `services/opensearch/query_builder.py`

```json
{
  "size": 10,
  "query": {
    "hybrid": {
      "queries": [
        {"bool": {"must": [{"match": {"chunk_text": "..."}}],
                   "filter": [{"terms": {"paper_id": ["..."]}}]}},
        {"script_score": {
          "query": {"bool": {"filter": [...]}},
          "script": {"source": "knn_score", "lang": "knn",
                     "params": {"field": "chunk_vector",
                                "query_value": [/* 1024-dim */],
                                "space_type": "cosinesimil"}}
        }}
      ]
    }
  }
}
```

Combined via the `hybrid-rrf-pipeline` search pipeline (RRF + min-max, weights [0.5, 0.5]).

### 7.4 Embeddings — `services/embeddings/openai.py`

- Model: `text-embedding-3-small` (1024 dim).
- Batched API calls.
- Fallback: zero vectors if no API key (test mode).

### 7.5 PDF Ingestion

- `services/pdf_parser/parser.py` — PyMuPDF extracts text (up to 40 pages by default); supports URL fetch (browser User-Agent) and in-memory bytes.
- `services/indexing/text_chunker.py` — 600-char chunks, 100-char overlap, 100-char minimum; optional section-based chunking.
- `services/indexing/document_indexer.py` — MinIO download → parse → chunk → embed (batch 50) → bulk-index; sets `document.chunks_indexed=True`.

---

## 8. User Journey Flows

### 8.1 Sign Up / Sign In

1. User visits `/sign-up` → Clerk hosted UI.
2. Clerk creates account, issues JWT.
3. Frontend calls `GET /api/v1/me` with the JWT.
4. Backend verifies, upserts `users` row, returns `User`.
5. Redirect to `/dashboard`.

### 8.2 Project Creation (5-Step Wizard — `NewProjectModal`)

1. Basic info (name, description)
2. Research goal
3. ArXiv categories (checkboxes)
4. Keywords — may call `POST /projects/suggest-keywords` for LLM-suggested keywords
5. Starter pack: `POST /projects/{id}/papers/discover` performs hybrid search using the embedded research goal; user accepts papers which are then persisted via `POST /projects/{id}/papers/add` with `added_by="starter_pack"`. Accepted papers trigger background chunk indexing.

### 8.3 Explore → Accept → Chat

1. **Explore:** `GET /api/v1/explore/search?q=...` — BM25 against `arxiv-papers`.
2. **Detail:** User views `PaperDetailPage` (`/dashboard/explore/paper/:arxivId`).
3. **Add:** `AddToProjectModal` → `POST /projects/{id}/papers/add` — upserts `Paper` + creates `project_papers` row (`status=accepted`) + schedules chunk indexing.
4. **Chat:** User opens project chat → `POST /sessions` → `POST /sessions/{sid}/messages` → SSE stream of RAG pipeline.

### 8.4 Document Upload

1. Multipart `POST /projects/{id}/documents` (PDF, ≤5 MB).
2. Backend validates, uploads to MinIO at `{project_id}/{doc_id}/{filename}`, inserts `documents` row, increments `project.document_count`.
3. `BackgroundTask`: download → PyMuPDF → chunk → embed → bulk-index → mark `chunks_indexed=True`.
4. Frontend polls `GET /projects/{id}/documents` to reflect indexing status.

### 8.5 Living Knowledge Base Sync

1. User creates a `ProjectTopic` (name, keywords, categories, year range).
2. Sync builds a hybrid query and surfaces candidate papers with `status=suggested`.
3. User accepts/rejects in the UI → `PATCH` updates `project_papers.status` + `status_updated_at`.
4. A `sync_events` row records the operation (audit).
5. Airflow `arxiv_daily_update` can flag drift and emit `drift_detected` events.

### 8.6 Error States

- **Off-topic query:** guardrail rejection → SSE `chunk` with rejection message then `done`.
- **No relevant chunks after retrieval + rewrite:** pipeline falls back to direct LLM response — risk of hallucination (see Section 9).
- **Indexing failure:** `Paper.chunks_indexing_failed=True` is set but **there is no automatic retry**.
- **Clerk 401:** frontend cannot refresh token cleanly; user must re-auth.

---

## 9. API Documentation (Reference)

All endpoints live under `/api/v1/`. Unless noted, all require `Authorization: Bearer <clerk-jwt>`.

> This section is a reference table. For request/response shapes, read the corresponding Pydantic classes in `backend/src/schemas/`.

### 9.1 Auth

#### `GET /api/v1/me`
- **Headers:** `Authorization: Bearer <jwt>`
- **Response 200:**
  ```json
  {"id": "uuid", "clerk_id": "str", "email": "str", "display_name": "str", "avatar_url": "str"}
  ```
- **Errors:** 401

### 9.2 Projects

#### `POST /api/v1/projects`
- **Body:**
  ```json
  {"name": "str", "description": "str?", "research_goal": "str?",
   "arxiv_categories": ["cs.AI"], "initial_keywords": ["str"],
   "year_from": 2020, "year_to": 2025}
  ```
- **Response 201:** `ProjectResponse`
- **Errors:** 400 (validation), 401

#### `GET /api/v1/projects?include_archived=false`
- **Response 200:** `ProjectResponse[]`

#### `GET /api/v1/projects/{project_id}`
- **Errors:** 403, 404

#### `PATCH /api/v1/projects/{project_id}`
- **Body:** partial `ProjectUpdate` (name, description, status, etc.)

#### `DELETE /api/v1/projects/{project_id}`
- Cascade deletes topics, papers (join rows only), documents, chat sessions.

#### `POST /api/v1/projects/{project_id}/topics`
- **Body:** `{"name", "arxiv_categories", "keywords", "year_from", "year_to"}`

#### `POST /api/v1/projects/suggest-keywords`
- **Body:** `{"research_goal": "str"}`
- **Response:** `{"keywords": ["str", ...]}`

### 9.3 Papers

#### `POST /api/v1/projects/{project_id}/papers/add`
- **Body:** `{"arxiv_id", "title", "abstract", "authors", "categories", "published_at", "topic_id?"}`
- **Response 201:** `ProjectPaperResponse`

#### `POST /api/v1/projects/{project_id}/papers/discover`
- Uses the project's embedded `research_goal` to hybrid-search `arxiv-papers`.

#### `POST /api/v1/projects/{project_id}/papers/search`
- Hybrid search within the project's accepted papers.

#### `PATCH /api/v1/projects/{project_id}/papers/{paper_id}`
- **Body:** `{"status": "accepted" | "rejected"}`
- Side effect: if `accepted`, triggers background chunk indexing.

### 9.4 Documents

#### `POST /api/v1/projects/{project_id}/documents`
- **Content-Type:** `multipart/form-data`
- **Form field:** `file` (PDF, ≤5 MB)
- **Errors:** 400 (wrong MIME / too large), 403, 404

### 9.5 Chat

#### `POST /api/v1/projects/{project_id}/chat/sessions`
- **Body:** `{"title": "str?"}`
- **Errors:** 429 (5/day limit)

#### `GET /api/v1/projects/{project_id}/chat/sessions/{session_id}/messages?limit=50&offset=0`

#### `POST /api/v1/projects/{project_id}/chat/sessions/{session_id}/messages`
- **Body:** `{"content": "str (1-4000)"}`
- **Response:** `text/event-stream` (SSE)
- **Events:**
  - `data: {"type":"chunk","content":"..."}`
  - `data: {"type":"citations","sources":[{"paper_id","document_id","arxiv_id","title","index"}]}`
  - `data: {"type":"done"}`
  - `data: {"type":"error","message":"..."}`

### 9.6 Explore

#### `GET /api/v1/explore/search`
- **Params:** `q`, `categories`, `year_from`, `year_to`, `page`, `limit`
- **Response:** paginated paper results (BM25).

### 9.7 Analytics

All return JSON time-series or histograms; consumed by `AnalyticsPage.tsx` via Recharts.

---

## 10. Security & Validation

### 10.1 Sanitization & Validation

- **Pydantic** handles type/length/format validation at the boundary.
- **No HTML sanitization** is needed server-side because the frontend renders markdown via `react-markdown`, which escapes HTML by default.
- **SQL injection** — not possible via SQLAlchemy ORM + parameterized queries.
- **Path traversal** in MinIO keys — keys are built from server-generated UUIDs (`{project_id}/{doc_id}/{original_filename}`); user-controlled filename is only the last segment but is not sanitized. **Minor risk:** a crafted filename like `../evil.pdf` could produce an unusual MinIO key but MinIO keys treat `/` literally, so this is cosmetic rather than exploitable.

### 10.2 Rate Limiting

- **Application-level:** 5 chat sessions per day per user.
- **No global API rate limiting** (no IP or token bucket). This is a production gap.

### 10.3 CORS

Configured in `backend/src/middlewares.py` / `main.py`:
- Dev origins: `http://localhost:3000`, `http://localhost:5173`.
- Credentials: allowed.
- Methods / headers: `*`.
- **Gap:** production origin(s) must be set via `CORS_ORIGINS` env var; the default list leaks dev origins if not overridden.

### 10.4 Secrets Management

- All secrets via env vars loaded by `pydantic-settings` using `__` as a nested delimiter (e.g., `OPENSEARCH__HOST`, `REDIS__PORT`).
- `.env` file is git-ignored; `.env.example` is the template.
- No Vault / cloud KMS integration.

### 10.5 TLS

- Nginx terminates TLS with a Cloudflare Origin Certificate (Full Strict).
- HSTS (max-age=31536000), X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy locking down camera/mic/geo.
- Port 80 redirects to HTTPS.

### 10.6 Observed Security Gaps

1. No API-wide rate limit — brute force / abuse risk.
2. Default CORS list includes dev origins — must be overridden in prod.
3. OpenSearch runs with `DISABLE_SECURITY_PLUGIN=true` in the compose stack — acceptable only if the container network is private.
4. PostgreSQL and MinIO use plaintext connections inside the Docker network — OK, but **no encryption at rest**.
5. Langfuse secret key in env — fine, but rotation is manual.
6. No audit trail for destructive actions (project / document delete) beyond `sync_events`.
7. No optimistic locking on `project_papers.status`, so concurrent accept/reject on the same paper is a minor race.

---

## 11. Weak Points & Risks

These are things I'd flag to a new developer as fragile, inconsistent, or half-built — not things that are simply "could be better."

1. **Background tasks are fire-and-forget.** Indexing runs via FastAPI `BackgroundTask`. If the API container restarts while a task is mid-flight, the work is lost. `Paper.chunks_indexing_failed` is set on exception but **nothing retries**. A real queue (Celery/Arq/RQ) would be a meaningful upgrade.

2. **Explore is BM25-only by design.** The codebase documents this as a scaling trade-off (`script_score` over 702k × 1024-dim vectors was too slow), but it means global discovery ignores semantic similarity. Inside a project it's fine; globally it's a surprise for users typing natural-language queries in Explore.

3. **~28k papers in `arxiv-papers` have no vector at all.** They were stripped during reindex because `cosinesimil` rejects zero vectors. Those papers are effectively invisible to vector search — only BM25 surfaces them. This is documented in CLAUDE.md but easy to forget.

4. **No API client on the frontend.** Every page re-implements fetch + auth-header + error-handling. Add/remove an auth flow and you'll chase changes across ~14 files. A single `apiFetch()` wrapper would pay for itself immediately.

5. **No global frontend state.** Cross-page data (e.g., the active project) is passed through React Router outlet context, which works but doesn't help when a modal on page A needs to trigger a refresh on page B. Most pages just refetch on mount.

6. **Denormalized counters (`paper_count`, `document_count`) are maintained by hand.** There's no reconciliation job — if any path forgets to increment, the count drifts permanently. I would recommend a periodic job that resets them from the source of truth.

7. **Hallucination check is scaffolded but not implemented.** The pipeline fires a span named "hallucination_check" but the function itself is a no-op placeholder (returns empty dict per the explorer's reading). Worth either implementing or removing.

8. **Rewrite loop is capped at 1.** If retrieval + rewrite still produces no relevant chunks, the pipeline proceeds to generation with an empty context, which is the classic "the model confabulates because nothing was retrieved" failure mode. Consider falling back to a hard refusal instead.

9. **5-session/day chat limit is hard-coded.** No way to grant exceptions or adjust per-user without a redeploy.

10. **No automated tests for the RAG pipeline.** The `backend/tests/` directory is sparse. Pipelines this complex with no unit tests is a liability.

11. **Paper status has no `pending_review` state.** Synced papers jump straight to `suggested` and the UI doesn't distinguish "just arrived" from "you already saw this and left it unreviewed."

12. **Old chat sessions are never archived.** No TTL, no cleanup. The `chat_sessions` and `chat_messages` tables grow monotonically.

13. **Airflow DAGs have no SLA monitoring or alerting.** If `arxiv_daily_update` fails, you find out by checking the Airflow UI.

14. **No cost controls.** Embedding + chat API calls are unmetered per user. A misbehaving or malicious user can run up real OpenAI bills.

15. **No offline / optimistic UI.** Chat SSE stalls silently on poor networks — the UI offers no retry path.

16. **Frontend has no error boundaries** (or at least none observed at the layout level). A render exception in one component takes down the whole page.

17. **Document deletion during an active chat is a race.** Chunks are removed from OpenSearch while an in-flight pipeline may still reference them. Not fatal, but could produce confusing "citation to deleted document" states.

18. **The `research_goal` embedding is computed once** at project creation. If the user edits it later, the stored embedding is not refreshed — discovery will silently use stale semantics.

---

## 12. For New Contributors — Quick Orientation

- **Run the stack:** `make start` → visit `http://localhost:3000`.
- **After any backend change:** `docker compose up --build -d api` (live mount is not used).
- **After any frontend change:** `docker compose up --build -d frontend`.
- **Migrations:** `make db-migrate msg="add something"` then `make db-upgrade`.
- **Lint + test backend:** `cd backend && make lint && make test`.
- **OpenSearch Dashboards:** `http://localhost:5601` — inspect indices and mappings.
- **MinIO Console:** `http://localhost:9003`.
- **Airflow:** `http://localhost:8080`.
- **Most critical file to understand first:** `backend/src/services/rag/pipeline.py` + `backend/src/services/agents/graph.py` — this is the product.
