# ResearchHub — Backend Project Structure

FastAPI backend using SQLAlchemy, Alembic, and service layer pattern.

---

## Directory Structure

```
backend/
├── src/
│   ├── main.py                         # FastAPI app entry point + lifespan
│   ├── config.py                       # All settings via pydantic-settings
│   ├── database.py                     # SQLAlchemy engine + session factory
│   ├── dependencies.py                 # Shared FastAPI DI (get_db, get_current_user)
│   ├── exceptions.py                   # Custom exceptions + handlers
│   ├── middlewares.py                  # CORS, request logging
│   │
│   ├── models/                         # SQLAlchemy ORM table definitions
│   │   ├── base.py                     # DeclarativeBase + timestamp mixin
│   │   ├── user.py                     # users + user_preferences
│   │   ├── project.py                  # projects + project_topics
│   │   ├── paper.py                    # papers + project_papers
│   │   ├── document.py                 # documents (MinIO PDF uploads)
│   │   └── chat.py                     # chat_sessions + chat_messages + sync_events
│   │
│   ├── schemas/                        # Pydantic request/response models (HTTP layer)
│   │   ├── user.py                     # UserResponse, UserPreferencesUpdate
│   │   ├── project.py                  # ProjectCreate, ProjectResponse, TopicCreate
│   │   ├── paper.py                    # PaperResponse, PaperSearchRequest
│   │   ├── document.py                 # DocumentUploadResponse
│   │   └── chat.py                     # ChatRequest, ChatResponse, MessageResponse
│   │
│   ├── repositories/                   # Database query layer (SQL only, no logic)
│   │   ├── user_repo.py                # get_by_clerk_id, upsert
│   │   ├── project_repo.py             # CRUD, list by owner
│   │   ├── paper_repo.py               # get_or_create, list by project, update status
│   │   ├── document_repo.py            # CRUD
│   │   └── chat_repo.py                # sessions CRUD, messages list/create
│   │
│   ├── services/                       # Business logic + external API clients
│   │   ├── auth/
│   │   │   └── clerk.py                # Verify Clerk JWT → return user dict
│   │   ├── arxiv/
│   │   │   └── client.py               # Search + fetch ArXiv paper metadata
│   │   ├── pdf_parser/
│   │   │   └── parser.py               # PDF → text extraction (docling)
│   │   ├── embeddings/
│   │   │   └── jina.py                 # Text → 1024-dim vectors (Jina AI)
│   │   ├── indexing/
│   │   │   ├── hybrid_indexer.py       # Orchestrate: chunk → embed → index
│   │   │   └── text_chunker.py         # Split text into overlapping chunks
│   │   ├── opensearch/
│   │   │   ├── client.py               # OpenSearch client wrapper
│   │   │   ├── index_config.py         # Hybrid index mapping (BM25 + KNN)
│   │   │   └── query_builder.py        # BM25 + KNN query DSL builder
│   │   ├── rag/
│   │   │   └── pipeline.py             # Retrieve → prompt → generate (Ollama)
│   │   ├── agents/                     # Agentic RAG via LangGraph
│   │   │   ├── graph.py                # LangGraph StateGraph definition
│   │   │   ├── state.py                # AgentState TypedDict
│   │   │   ├── prompts.py              # Prompt templates
│   │   │   └── nodes/
│   │   │       ├── guardrail.py        # Safety / topic relevance check
│   │   │       ├── retrieve.py         # Retrieve chunks from OpenSearch
│   │   │       ├── grade_docs.py       # Grade retrieved docs for relevance
│   │   │       ├── rewrite_query.py    # Query expansion / rewriting
│   │   │       └── generate_answer.py  # Final answer generation
│   │   ├── storage/
│   │   │   └── minio.py                # MinIO upload/download/presign URLs
│   │   ├── cache/
│   │   │   └── redis.py                # Redis get/set/delete wrapper
│   │   └── langfuse/
│   │       └── tracer.py               # Trace decorator for LLM calls
│   │
│   └── routers/                        # FastAPI route handlers (HTTP only)
│       ├── __init__.py                 # Mounts all routers
│       ├── health.py                   # GET /health
│       ├── auth.py                     # GET /me
│       ├── projects.py                 # CRUD /projects
│       ├── papers.py                   # /projects/{id}/papers — search, add, list
│       ├── documents.py                # /projects/{id}/documents — upload, list
│       ├── chat.py                     # /projects/{id}/chat — sessions + messages
│       └── search.py                   # POST /search — hybrid BM25 + vector
│
├── alembic/                            # DB migration files
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│
├── tests/
│   ├── conftest.py                     # Fixtures: test DB, mock clients
│   ├── api/                            # Route/integration tests
│   │   └── routers/
│   └── unit/                           # Service + logic tests
│       ├── test_config.py
│       ├── test_arxiv_client.py
│       └── test_opensearch_query_builder.py
│
├── notebooks/                          # Jupyter (experimentation only)
├── airflow/                            # Airflow DAGs + Dockerfile
├── pyproject.toml
├── Dockerfile
└── README.md
```

---

## Layer Responsibilities

| Layer            | Location        | Rule                                                       |
| ---------------- | --------------- | ---------------------------------------------------------- |
| **Routing**      | `routers/`      | HTTP only — validate input, call services, return response |
| **Services**     | `services/`     | Business logic + external API calls                        |
| **Repositories** | `repositories/` | SQL queries only — no business logic                       |
| **Models**       | `models/`       | SQLAlchemy table definitions                               |
| **Schemas**      | `schemas/`      | Pydantic shapes for HTTP requests/responses                |

**Data flow (one direction only):**

```
routers → services → repositories → models (PostgreSQL)
                  ↓
          external APIs (ArXiv, Jina, OpenSearch, Ollama, MinIO)
```

---

## Shared FastAPI Dependencies (`dependencies.py`)

```python
get_db()              # → Session          PostgreSQL session per request
get_current_user()    # → User             Clerk JWT → DB user (auth guard)
get_settings()        # → Settings         Cached app config
get_opensearch()      # → OpenSearchClient Singleton client
get_cache()           # → RedisClient       Singleton client
get_minio()           # → MinioClient       Singleton client
```

---

## Build Order

```
1. models/base.py + models/*.py
2. Alembic init + first migration
3. config.py + database.py + dependencies.py + exceptions.py
4. services/auth/clerk.py → routers/auth.py
5. routers/projects.py (CRUD)
6. services/arxiv/ + services/pdf_parser/ + services/storage/minio.py
7. routers/papers.py + routers/documents.py
8. services/embeddings/ + services/indexing/ + services/opensearch/
9. routers/search.py
10. services/rag/pipeline.py → routers/chat.py
11. services/agents/ (LangGraph agentic RAG — last, most complex)
```

---

## Key Design Decisions

| Decision        | Choice                                        |
| --------------- | --------------------------------------------- |
| ORM             | SQLAlchemy (sync, psycopg2 driver)            |
| Migrations      | Alembic                                       |
| Auth            | Clerk JWT verified in `dependencies.py`       |
| PDF Storage     | MinIO (`services/storage/minio.py`)           |
| Vector Store    | OpenSearch (BM25 + KNN hybrid)                |
| Embeddings      | Jina AI 1024-dim vectors                      |
| LLM             | Ollama (local, llama3.2:1b)                   |
| Observability   | Langfuse trace decorator                      |
| Factory Pattern | ❌ Not used — simple DI via `dependencies.py` |
