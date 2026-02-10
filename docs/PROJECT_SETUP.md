# ResearchHub — From Zero to Running Stack

> A hands-on, step-by-step learning guide to setting up the ResearchHub RAG project from scratch. Every section explains **what** you're doing, **why** it matters, and the **exact files/commands** involved.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Initialization with uv](#2-project-initialization-with-uv)
3. [Project Structure](#3-project-structure)
4. [Dependency Management with uv](#4-dependency-management-with-uv)
5. [Environment Variables Deep-Dive](#5-environment-variables-deep-dive)
6. [Understanding the Dockerfile](#6-understanding-the-dockerfile)
7. [Understanding Docker Compose](#7-understanding-docker-compose)
8. [The Makefile — Your Command Center](#8-the-makefile--your-command-center)
9. [How Configuration Flows into Code](#9-how-configuration-flows-into-code)
10. [Adapting the Stack for ResearchHub](#10-adapting-the-stack-for-researchhub)
11. [Running & Validating the Stack](#11-running--validating-the-stack)
12. [Quick Reference Cheat Sheet](#12-quick-reference-cheat-sheet)

---

## 1. Prerequisites

Install these tools **before anything else**.

| Tool                  | Purpose                           | Install                                                                       |
| --------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| **Python 3.12**       | Runtime for the backend           | [python.org](https://www.python.org/downloads/) or `brew install python@3.12` |
| **uv**                | Ultra-fast Python package manager | `curl -LsSf https://astral.sh/uv/install.sh \| sh`                            |
| **Docker Desktop**    | Containers for all services       | [docker.com](https://www.docker.com/products/docker-desktop/)                 |
| **Docker Compose v2** | Multi-container orchestration     | Bundled with Docker Desktop                                                   |
| **Git**               | Version control                   | `brew install git`                                                            |
| **curl / jq**         | Health-checking services          | `brew install curl jq`                                                        |

> [!TIP]
> Verify everything before proceeding:
>
> ```bash
> python3.12 --version   # Python 3.12.x
> uv --version           # 0.6.x+
> docker --version       # 27.x+
> docker compose version # v2.x
> ```

---

## 2. Project Initialization with uv

### 2.1 What is uv?

**uv** is a drop-in replacement for `pip`, `pip-tools`, and `virtualenv` — written in Rust. It is **10-100×** faster than pip and uses a `pyproject.toml` + `uv.lock` workflow (similar to npm's `package.json` + `package-lock.json`).

### 2.2 Creating a New Project

```bash
# Create the project directory
mkdir researchhub && cd researchhub

# Initialize a new uv project (creates pyproject.toml and .venv)
uv init --python 3.12
```

This generates a minimal `pyproject.toml`:

```toml
[project]
name = "researchhub"
version = "0.1.0"
description = ""
requires-python = ">=3.12,<3.13"
dependencies = []
```

### 2.3 The Key Files uv Creates & Uses

| File             | Purpose                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `pyproject.toml` | Project metadata + all dependencies (like `package.json`)                 |
| `uv.lock`        | Exact pinned dependency tree (like `package-lock.json`). **Commit this.** |
| `.venv/`         | Local virtual environment (auto-created). **Do NOT commit.**              |

> [!IMPORTANT]
> Always pin your Python version to a narrow range (`>=3.12,<3.13`) to avoid compatibility surprises between team members and Docker.

---

## 3. Project Structure

Here is the folder layout this codebase follows through a **layered architecture** pattern:

```
researchhub/
├── .env                    # ← Your local secrets (git-ignored)
├── .env.example            # ← Template for .env (committed)
├── .env.test               # ← Test-specific config
├── .gitignore
├── Dockerfile              # ← Backend API container
├── Makefile                # ← Developer shortcuts
├── compose.yml             # ← All services orchestration
├── pyproject.toml          # ← Dependencies & project metadata
├── uv.lock                 # ← Pinned dependency versions
│
├── src/                    # ← Application source code
│   ├── main.py             #    FastAPI app entry point
│   ├── config.py           #    Pydantic settings (reads .env)
│   ├── database.py         #    DB session helper
│   ├── dependencies.py     #    FastAPI dependency injection
│   ├── exceptions.py       #    Custom error handlers
│   ├── middlewares.py      #    CORS, logging, etc.
│   │
│   ├── models/             #    SQLAlchemy ORM models
│   │   └── paper.py        #    Paper table definition
│   │
│   ├── schemas/            #    Pydantic request/response schemas
│   │
│   ├── routers/            #    FastAPI route handlers
│   │   ├── ping.py         #    Health check
│   │   ├── hybrid_search.py#    Vector + BM25 search
│   │   ├── ask.py          #    RAG Q&A endpoint
│   │   └── agentic_ask.py  #    Agentic RAG endpoint
│   │
│   ├── services/           #    Business logic layer
│   │   ├── arxiv/          #    ArXiv API client
│   │   ├── cache/          #    Redis caching
│   │   ├── embeddings/     #    Vector embeddings (Jina AI)
│   │   ├── indexing/       #    Document indexing pipeline
│   │   ├── langfuse/       #    LLM tracing / observability
│   │   ├── ollama/         #    LLM inference client
│   │   ├── opensearch/     #    Vector DB client
│   │   ├── pdf_parser/     #    PDF text extraction (Docling)
│   │   └── telegram/       #    Telegram bot interface
│   │
│   └── db/                 #    Database layer
│       ├── factory.py      #    DB instance factory
│       └── interfaces/     #    Abstract + PostgreSQL impl
│
├── airflow/                #    Scheduled pipeline (DAGs)
│   ├── Dockerfile          #    Airflow container
│   ├── entrypoint.sh       #    Airflow init + start script
│   ├── dags/               #    DAG definitions
│   └── requirements-airflow.txt
│
├── tests/                  #    Pytest test suite
└── notebooks/              #    Jupyter exploration notebooks
```

> [!NOTE]
> The **factory pattern** (e.g., `make_opensearch_client()`, `make_pdf_parser_service()`) is used throughout `src/services/`. Each service has a `factory.py` that reads from `Settings` and returns an initialized client. This keeps your `main.py` clean and makes testing easy (swap the factory in tests).

---

## 4. Dependency Management with uv

### 4.1 Adding Libraries

```bash
# Add a single production dependency
uv add fastapi

# Add with version constraint
uv add "fastapi[standard]>=0.115.12"

# Add multiple at once
uv add sqlalchemy psycopg2-binary alembic

# Add a DEV-only dependency (testing, linting)
uv add --group dev pytest ruff mypy
```

Each `uv add` command:

1. Resolves all dependency versions
2. Updates `pyproject.toml` under `[project] dependencies` (or `[dependency-groups]`)
3. Regenerates `uv.lock` with the full pinned tree
4. Installs into `.venv/`

### 4.2 The Full Dependency List for ResearchHub

Here is the current [pyproject.toml](file:///Users/youhorng/Desktop/final-year-project/production-agentic-rag-course/pyproject.toml) breakdown:

#### Production Dependencies

| Package                                   | Purpose in ResearchHub                              |
| ----------------------------------------- | --------------------------------------------------- |
| `fastapi[standard]`                       | Web framework for the REST API                      |
| `uvicorn`                                 | ASGI server to serve FastAPI                        |
| `pydantic` / `pydantic-settings`          | Data validation + environment variable loading      |
| `sqlalchemy` / `psycopg2-binary`          | ORM for PostgreSQL (projects, papers, chat history) |
| `alembic`                                 | Database schema migrations                          |
| `opensearch-py`                           | Client for OpenSearch vector database               |
| `requests` / `httpx`                      | HTTP clients for ArXiv API calls                    |
| `docling`                                 | PDF text extraction (replaces PyPDF2/pdfplumber)    |
| `sentence-transformers`                   | Local embedding model (fallback)                    |
| `redis`                                   | Caching layer for search results                    |
| `langfuse`                                | LLM call tracing and observability                  |
| `langgraph` / `langchain` / `langchain-*` | Agentic RAG pipeline                                |
| `gradio`                                  | Quick prototyping UI                                |
| `python-telegram-bot`                     | Telegram bot interface                              |

#### Dev Dependencies

| Package               | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `pytest` / `pytest-*` | Testing framework and plugins                        |
| `ruff`                | Linter + formatter (replaces black + isort + flake8) |
| `mypy`                | Static type checking                                 |
| `pre-commit`          | Git hooks for auto-formatting                        |
| `testcontainers`      | Spin up Docker containers in tests                   |

### 4.3 Installing All Dependencies

```bash
# Install everything (production + dev)
uv sync

# Install production only (what Docker uses)
uv sync --no-dev

# Run a command through the venv without activating it
uv run uvicorn src.main:app --reload
uv run pytest
uv run ruff check
```

### 4.4 Adding New Libraries for ResearchHub Features

When you need a new library for your project, the workflow is always:

```bash
# Example: add a library for PDF export
uv add weasyprint

# Example: add a auth library
uv add "python-jose[cryptography]" passlib bcrypt

# Then commit both files
git add pyproject.toml uv.lock
git commit -m "feat: add authentication dependencies"
```

> [!CAUTION]
> **Never** edit `uv.lock` manually. It is auto-generated. Only `pyproject.toml` is human-editable.

---

## 5. Environment Variables Deep-Dive

### 5.1 The Three Environment Files

| File           | Git-tracked? | Purpose                                                          |
| -------------- | ------------ | ---------------------------------------------------------------- |
| `.env.example` | ✅ Yes       | Template with placeholder values. Copy to `.env` to get started. |
| `.env`         | ❌ No        | **Your actual secrets.** Never commit this.                      |
| `.env.test`    | ✅ Yes       | Overrides for the `pytest` test suite.                           |

### 5.2 Creating Your `.env`

```bash
cp .env.example .env
```

Then open `.env` and fill in the values. Here is a section-by-section walkthrough:

#### Application Settings

```bash
DEBUG=true                    # Enable debug logging
ENVIRONMENT=development       # development | staging | production
```

#### PostgreSQL (Relational Data)

```bash
# Format: postgresql+psycopg2://<user>:<password>@<host>:<port>/<database>
# In Docker Compose, the host is the service name "postgres"
POSTGRES_DATABASE_URL=postgresql+psycopg2://rag_user:rag_password@postgres:5432/rag_db
```

> [!IMPORTANT]
> The host is `postgres` (the Docker service name) when running inside containers, but `localhost` when running the app locally outside Docker.

#### OpenSearch (Vector Database)

```bash
OPENSEARCH_HOST=http://opensearch:9200    # Docker service name
OPENSEARCH__HOST=http://opensearch:9200   # Nested config format (double underscore)
OPENSEARCH__INDEX_NAME=arxiv-papers       # Name of the main index
OPENSEARCH__VECTOR_DIMENSION=1024         # Must match your embedding model's output
OPENSEARCH__VECTOR_SPACE_TYPE=cosinesimil # Similarity metric
```

#### Embedding & LLM Services

```bash
# Jina AI cloud embeddings (1024-dim, best quality)
JINA_API_KEY=your_jina_api_key_here       # Get from https://jina.ai/

# Ollama (local LLM inference)
OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=llama3.2:1b                  # Lightweight model for dev
OLLAMA_TIMEOUT=300                        # 5 min timeout for slow responses
```

#### ArXiv API

```bash
ARXIV__MAX_RESULTS=15                     # Papers per search query
ARXIV__BASE_URL=https://export.arxiv.org/api/query
ARXIV__RATE_LIMIT_DELAY=3.0              # Seconds between requests (be polite)
ARXIV__SEARCH_CATEGORY=cs.AI             # Default category filter
```

#### PDF Processing

```bash
PDF_PARSER__MAX_PAGES=30                  # Skip papers longer than 30 pages
PDF_PARSER__MAX_FILE_SIZE_MB=20           # Reject files over 20MB
PDF_PARSER__DO_OCR=false                  # OCR is slow; enable if needed
PDF_PARSER__DO_TABLE_STRUCTURE=true       # Extract table layouts
```

#### Text Chunking (for Vector Indexing)

```bash
CHUNKING__CHUNK_SIZE=600                  # ~600 words per chunk
CHUNKING__OVERLAP_SIZE=100                # 100-word overlap between chunks
CHUNKING__MIN_CHUNK_SIZE=100              # Discard very small chunks
CHUNKING__SECTION_BASED=true              # Respect paper section boundaries
```

#### Redis (Caching)

```bash
REDIS__HOST=redis
REDIS__PORT=6379
REDIS__TTL_HOURS=6                        # Cache search results for 6 hours
```

#### Langfuse (LLM Observability)

```bash
# Client config (your app connects to Langfuse with these)
LANGFUSE_ENABLED=true
LANGFUSE_HOST=http://localhost:3001
LANGFUSE_PUBLIC_KEY=pk-lf-xxx             # Get from Langfuse UI after first login
LANGFUSE_SECRET_KEY=sk-lf-xxx

# Server config (for self-hosted Langfuse containers)
LANGFUSE_NEXTAUTH_SECRET=changeme-v3-nextauth-secret-min-32-chars
LANGFUSE_SALT=changeme-v3-salt-min-32-chars
LANGFUSE_ENCRYPTION_KEY=changeme-64-hex-chars        # Generate with: openssl rand -hex 32
LANGFUSE_REDIS_PASSWORD=langfuse_redis_password
LANGFUSE_MINIO_ACCESS_KEY=langfuse_minio
LANGFUSE_MINIO_SECRET_KEY=langfuse_minio_secret
```

### 5.3 How Environment Variables Are Read — The Double Underscore Convention

The codebase uses **pydantic-settings** with `env_nested_delimiter="__"`. This means:

```
OPENSEARCH__HOST=http://opensearch:9200
         ↑↑
    double underscore = nested attribute
```

Maps to `Settings().opensearch.host` in Python, defined in [config.py](file:///Users/youhorng/Desktop/final-year-project/production-agentic-rag-course/src/config.py):

```python
class OpenSearchSettings(BaseConfigSettings):
    model_config = SettingsConfigDict(
        env_prefix="OPENSEARCH__",   # ← Reads OPENSEARCH__* env vars
        env_nested_delimiter="__",
    )
    host: str = "http://localhost:9200"  # ← OPENSEARCH__HOST fills this
```

Variables **without** double underscore (like `JINA_API_KEY`) map to top-level `Settings` fields directly.

---

## 6. Understanding the Dockerfile

The [Dockerfile](file:///Users/youhorng/Desktop/final-year-project/production-agentic-rag-course/Dockerfile) uses a **multi-stage build** to keep the final image small and fast.

### Stage 1: `base` — Install Dependencies

```dockerfile
FROM ghcr.io/astral-sh/uv:python3.12-bookworm AS base
#    ↑ Official uv image with Python 3.12 pre-installed

WORKDIR /app

COPY pyproject.toml uv.lock ./
#    ↑ Copy ONLY dependency files first (Docker layer caching!)

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
#   ↑ UV_COMPILE_BYTECODE: generate .pyc files → faster startup
#   ↑ UV_LINK_MODE=copy: avoid warnings about hard links

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=/app/uv.lock \
    --mount=type=bind,source=pyproject.toml,target=/app/pyproject.toml \
    uv sync --frozen --no-dev
#   ↑ --frozen: don't update the lock file, just install what's locked
#   ↑ --no-dev: skip dev dependencies for production
#   ↑ --mount=type=cache: reuse the uv download cache across builds

COPY src /app/src
#    ↑ Copy source code AFTER dependencies (cache-friendly order)
```

> [!TIP]
> **Why copy `pyproject.toml` before `src/`?** Docker caches each layer. If your code changes but dependencies don't, Docker skips the slow `uv sync` step entirely. This is a **major** build speed optimization.

### Stage 2: `final` — Slim Runtime Image

```dockerfile
FROM python:3.12.8-slim AS final
#    ↑ Switch to a slim base image (no uv, no build tools)

EXPOSE 8000

ENV PYTHONUNBUFFERED=1
#   ↑ Ensures print/log output appears immediately in `docker logs`

WORKDIR /app

COPY --from=base /app /app
#    ↑ Copy the entire /app (with .venv) from the build stage

ENV PATH="/app/.venv/bin:$PATH"
#   ↑ Put the virtual environment first in PATH

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
#    ↑ Start FastAPI with 4 worker processes
```

### Building & Testing the Image

```bash
# Build the image
docker build -t researchhub-api .

# Run it standalone (for testing)
docker run -p 8000:8000 --env-file .env researchhub-api

# Check image size
docker images researchhub-api
```

---

## 7. Understanding Docker Compose

The [compose.yml](file:///Users/youhorng/Desktop/final-year-project/production-agentic-rag-course/compose.yml) defines a **14-service architecture**. Here's a visual map:

```mermaid
graph TB
    subgraph "Core Application"
        API[API Service<br/>FastAPI :8000]
    end

    subgraph "Data Layer"
        PG[PostgreSQL :5432<br/>Projects/Papers/Chat]
        OS[OpenSearch :9200<br/>Vector + Full-text]
        Redis[Redis :6379<br/>Cache]
    end

    subgraph "AI Layer"
        Ollama[Ollama :11434<br/>Local LLM]
    end

    subgraph "Pipeline Layer"
        Airflow[Airflow :8080<br/>Scheduled DAGs]
    end

    subgraph "Observability"
        LFWeb[Langfuse Web :3001]
        LFWorker[Langfuse Worker]
        LFPostgres[Langfuse PG :5433]
        LFRedis[Langfuse Redis :6380]
        LFMinio[Langfuse MinIO :9090]
        Clickhouse[ClickHouse]
    end

    subgraph "Monitoring"
        OSDash[OpenSearch Dashboards :5601]
    end

    API --> PG
    API --> OS
    API --> Redis
    API --> Ollama
    API --> LFWeb

    Airflow --> PG
    Airflow --> OS
    Airflow --> Ollama

    LFWeb --> LFPostgres
    LFWeb --> Clickhouse
    LFWeb --> LFRedis
    LFWeb --> LFMinio
    LFWorker --> LFPostgres
    LFWorker --> Clickhouse
    LFWorker --> LFRedis
    LFWorker --> LFMinio
```

### 7.1 Service-by-Service Breakdown

#### The API Service (Your App)

```yaml
api:
  build: . # Build from ./Dockerfile
  container_name: rag-api
  ports:
    - "8000:8000" # Expose on localhost:8000
  depends_on:
    postgres:
      condition: service_healthy # Wait until PG is ready
    opensearch:
      condition: service_healthy
    redis:
      condition: service_healthy
  env_file:
    - .env # Load all vars from .env
  environment: # Override specific vars for Docker networking
    - OPENSEARCH_HOST=http://opensearch:9200 # ← service name, not localhost
    - POSTGRES_DATABASE_URL=postgresql+psycopg2://rag_user:rag_password@postgres:5432/rag_db
    - OLLAMA_HOST=http://ollama:11434
    - REDIS__HOST=redis
```

> [!IMPORTANT]
> **`depends_on` with `condition: service_healthy`** — This ensures your API doesn't crash on startup because PostgreSQL hasn't finished initializing yet. Each dependency defines a `healthcheck` that Docker polls.

#### PostgreSQL (Relational Database)

```yaml
postgres:
  image: postgres:16-alpine
  environment:
    - POSTGRES_DB=rag_db # Auto-create this database
    - POSTGRES_USER=rag_user # Auto-create this user
    - POSTGRES_PASSWORD=rag_password
  ports:
    - "5432:5432" # Access from host for debugging
  volumes:
    - postgres_data:/var/lib/postgresql/data # Persist data across restarts
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U rag_user -d rag_db"]
    interval: 5s
    retries: 10
```

**What it stores for ResearchHub:** Users, projects, papers metadata, chat sessions, chat messages.

#### OpenSearch (Vector Database)

```yaml
opensearch:
  image: opensearchproject/opensearch:2.19.0
  environment:
    - discovery.type=single-node # Dev mode: no cluster
    - OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m # Memory limits
    - DISABLE_SECURITY_PLUGIN=true # Skip auth for dev
  ports:
    - "9200:9200" # REST API
  ulimits:
    memlock:
      soft: -1
      hard: -1 # Required for OpenSearch
  volumes:
    - opensearch_data:/usr/share/opensearch/data
```

**What it stores for ResearchHub:** Paper chunks with vector embeddings, enabling semantic search and hybrid (BM25 + vector) retrieval.

#### Redis (Cache)

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
  #                      ↑ persist data   ↑ cap memory     ↑ evict least-recently-used
  ports:
    - "6379:6379"
```

**What it does for ResearchHub:** Caches search results, embedding computations, and ArXiv API responses to reduce latency and API costs.

#### Ollama (Local LLM)

```yaml
ollama:
  image: ollama/ollama:0.11.2
  ports:
    - "11434:11434"
  volumes:
    - ollama_data:/root/.ollama # Persist downloaded models
```

After starting, you need to **pull a model**:

```bash
docker exec -it rag-ollama ollama pull llama3.2:1b
```

#### Airflow (Scheduled Pipelines)

```yaml
airflow:
  build:
    context: ./airflow # Has its own Dockerfile
  depends_on:
    postgres:
      condition: service_healthy
  volumes:
    - ./airflow/dags:/opt/airflow/dags # Mount DAGs for live editing
    - ./src:/opt/airflow/src # Share source code with API
  ports:
    - "8080:8080"
```

**What it does for ResearchHub:** Runs scheduled tasks like "fetch new ArXiv papers every week" and "re-index stale documents".

### 7.2 Docker Networking

All services join a single bridge network:

```yaml
networks:
  rag-network:
    driver: bridge
```

This means every service can reach any other service by its **service name** (e.g., `http://postgres:5432`). From outside Docker (your Mac), you reach services via `localhost:<mapped_port>`.

### 7.3 Volumes — Persistent Data

```yaml
volumes:
  postgres_data: # Your project/paper data
  opensearch_data: # Vector indices
  ollama_data: # Downloaded LLM models (~4GB+)
  redis_data: # Cache data
  airflow_logs: # Pipeline execution logs
  clickhouse_data: # Langfuse analytics
```

> [!WARNING]
> Running `docker compose down -v` deletes **all volumes** (all your data). Use plain `docker compose down` to stop services without data loss.

---

## 8. The Makefile — Your Command Center

The [Makefile](file:///Users/youhorng/Desktop/final-year-project/production-agentic-rag-course/Makefile) wraps common commands:

| Command        | What It Does                                              |
| -------------- | --------------------------------------------------------- |
| `make start`   | `docker compose up --build -d` — Build & start everything |
| `make stop`    | `docker compose down` — Stop (keep data)                  |
| `make restart` | Restart all containers                                    |
| `make status`  | Show container status                                     |
| `make logs`    | Tail all service logs                                     |
| `make health`  | Curl health endpoints                                     |
| `make setup`   | `uv sync` — Install Python deps locally                   |
| `make format`  | `uv run ruff format` — Auto-format code                   |
| `make lint`    | `uv run ruff check --fix && uv run mypy src/`             |
| `make test`    | `uv run pytest`                                           |
| `make clean`   | ⚠️ Stop + **delete all volumes**                          |

---

## 9. How Configuration Flows into Code

Here is the full journey of a configuration value:

```
.env file                    ← You edit this
  ↓
pydantic-settings            ← Reads env vars automatically
  ↓
src/config.py (Settings)     ← Typed, validated Python object
  ↓
src/services/*/factory.py    ← Factory reads Settings, creates client
  ↓
src/main.py (lifespan)       ← Stores client on app.state
  ↓
src/dependencies.py          ← FastAPI Depends() injects into routes
  ↓
src/routers/*.py             ← Route handler uses the injected service
```

**Example flow for OpenSearch:**

```python
# 1. .env
# OPENSEARCH__HOST=http://opensearch:9200

# 2. config.py
class OpenSearchSettings(BaseConfigSettings):
    host: str = "http://localhost:9200"   # ← OPENSEARCH__HOST fills this

class Settings(BaseConfigSettings):
    opensearch: OpenSearchSettings = Field(default_factory=OpenSearchSettings)

# 3. services/opensearch/factory.py
def make_opensearch_client():
    settings = get_settings()
    return OpenSearchClient(host=settings.opensearch.host, ...)

# 4. main.py
app.state.opensearch_client = make_opensearch_client()

# 5. dependencies.py
def get_opensearch_client(request: Request) -> OpenSearchClient:
    return request.app.state.opensearch_client

# 6. routers/hybrid_search.py
@router.get("/search")
def search(client = Depends(get_opensearch_client)):
    return client.search(...)
```

---

## 10. Adapting the Stack for ResearchHub

The current codebase is a general "arXiv RAG" system. Here's how each piece maps to ResearchHub's proposal requirements and what to add:

### 10.1 What's Already Built (Reuse As-Is)

| ResearchHub Feature  | Existing Implementation                             |
| -------------------- | --------------------------------------------------- |
| ArXiv Integration    | `src/services/arxiv/` — search + fetch papers       |
| PDF Processing       | `src/services/pdf_parser/` — Docling extraction     |
| Text Chunking        | `src/config.py` ChunkingSettings + indexing service |
| Vector Storage       | `src/services/opensearch/` — hybrid index           |
| Embedding Generation | `src/services/embeddings/` — Jina AI                |
| RAG Chat             | `src/routers/ask.py` + `agentic_ask.py`             |
| LLM Integration      | `src/services/ollama/` — Ollama client              |
| Caching              | `src/services/cache/` — Redis                       |
| Observability        | `src/services/langfuse/` — tracing                  |
| Scheduled Pipelines  | `airflow/dags/` — weekly fetch                      |

### 10.2 What You Need to Add

#### New SQLAlchemy Models

Add these to `src/models/`:

```python
# src/models/user.py        → User accounts (single-user auth)
# src/models/project.py     → Research projects with metadata
# src/models/chat_session.py → Chat conversations per project
# src/models/chat_message.py → Individual messages with citations
```

#### New Database Tables

Use Alembic migrations:

```bash
# Initialize alembic (one-time)
uv run alembic init alembic

# After creating new models, generate a migration
uv run alembic revision --autogenerate -m "add project and chat tables"

# Apply the migration
uv run alembic upgrade head
```

#### New Dependencies to Add

```bash
# Authentication
uv add "python-jose[cryptography]" passlib bcrypt python-multipart

# PDF file uploads
uv add python-multipart aiofiles

# Markdown/PDF export
uv add markdown weasyprint

# ArXiv scheduled tasks (already have Airflow)
# No new deps needed

# Frontend (separate project or add to this repo)
# If React: create a /frontend directory with its own setup
```

#### New Docker Services for ResearchHub

Add a **MinIO** service for storing uploaded PDFs:

```yaml
# Add to compose.yml
minio:
  image: minio/minio
  container_name: researchhub-minio
  command: server /data --console-address ":9001"
  environment:
    - MINIO_ROOT_USER=researchhub
    - MINIO_ROOT_PASSWORD=researchhub_secret
  ports:
    - "9000:9000" # S3 API
    - "9001:9001" # Web console
  volumes:
    - minio_data:/data
  healthcheck:
    test: ["CMD", "mc", "ready", "local"]
    interval: 5s
    timeout: 5s
    retries: 10
  networks:
    - rag-network
```

Add **MinIO volume**:

```yaml
volumes:
  # ... existing volumes ...
  minio_data:
```

#### New Environment Variables

```bash
# Add to .env.example and .env

# Authentication
JWT_SECRET_KEY=your-secret-key-min-32-chars
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

# File Storage (MinIO S3-compatible)
MINIO__ENDPOINT=minio:9000
MINIO__ACCESS_KEY=researchhub
MINIO__SECRET_KEY=researchhub_secret
MINIO__BUCKET_NAME=researchhub-papers
MINIO__SECURE=false
```

### 10.3 Feature → Service Mapping

| ResearchHub Feature       | Service to Build/Extend                                  |
| ------------------------- | -------------------------------------------------------- |
| **Project Management**    | New `src/routers/projects.py` + `src/services/projects/` |
| **User Auth**             | New `src/routers/auth.py` + `src/services/auth/`         |
| **PDF Upload**            | New `src/routers/upload.py` + MinIO service              |
| **Chat History**          | New `src/routers/chat.py` + PostgreSQL models            |
| **Citation Tracking**     | Extend `src/routers/ask.py` to return source metadata    |
| **Topic Drift Detection** | New `src/services/drift/` — compare embeddings over time |
| **Sync & Clean**          | New Airflow DAG + `src/services/sync/`                   |
| **Smart Suggestions**     | New Airflow DAG using existing ArXiv service             |
| **Dashboard Stats**       | New `src/routers/dashboard.py` — aggregate queries       |
| **Export**                | New `src/services/export/` — markdown/PDF generation     |
| **Frontend**              | Separate React/Next.js app or extend Gradio              |

---

## 11. Running & Validating the Stack

### 11.1 First-Time Setup

```bash
# 1. Clone and enter the project
git clone <your-repo-url> researchhub
cd researchhub

# 2. Create your environment file
cp .env.example .env
# Edit .env with your actual API keys (JINA_API_KEY at minimum)

# 3. Install Python dependencies locally
uv sync

# 4. Start all Docker services
make start
# Or: docker compose up --build -d

# 5. Wait ~60 seconds for all services to become healthy
make status
# Watch for all services showing "healthy"

# 6. Pull an LLM model into Ollama
docker exec -it rag-ollama ollama pull llama3.2:1b
```

### 11.2 Verify Each Service

```bash
# API
curl http://localhost:8000/api/v1/health | jq .

# PostgreSQL
docker exec -it rag-postgres psql -U rag_user -d rag_db -c "SELECT 1;"

# OpenSearch
curl http://localhost:9200/_cluster/health | jq .

# Redis
docker exec -it rag-redis redis-cli ping

# Ollama
curl http://localhost:11434/api/version | jq .

# Airflow
open http://localhost:8080   # Login: admin/admin

# Langfuse
open http://localhost:3001   # Create account on first visit

# OpenSearch Dashboards
open http://localhost:5601
```

### 11.3 Day-to-Day Development Workflow

```bash
# Start services (skip rebuild if no Dockerfile changes)
docker compose up -d

# Run the API locally (outside Docker, for hot-reload)
uv run uvicorn src.main:app --reload --port 8000

# Run tests
uv run pytest

# Format + lint before committing
uv run ruff format
uv run ruff check --fix

# Add a new dependency
uv add <package-name>
git add pyproject.toml uv.lock
git commit -m "feat: add authentication dependencies"
```

> [!TIP]
> When developing locally (outside Docker), change your `.env` hosts from service names to `localhost`:
>
> ```bash
> POSTGRES_DATABASE_URL=postgresql+psycopg2://rag_user:rag_password@localhost:5432/rag_db
> OPENSEARCH__HOST=http://localhost:9200
> OLLAMA_HOST=http://localhost:11434
> REDIS__HOST=localhost
> ```

---

## 12. Quick Reference Cheat Sheet

### uv Commands

```bash
uv init --python 3.12        # New project
uv add <pkg>                  # Add production dependency
uv add --group dev <pkg>      # Add dev dependency
uv remove <pkg>               # Remove dependency
uv sync                       # Install all deps
uv sync --frozen --no-dev     # Install locked production deps
uv run <cmd>                  # Run command in venv
uv lock                       # Regenerate lock file
```

### Docker Commands

```bash
docker compose up -d           # Start all services (detached)
docker compose up --build -d   # Rebuild images + start
docker compose down            # Stop (keep data)
docker compose down -v         # Stop + DELETE all data
docker compose logs -f <svc>   # Tail logs for one service
docker compose ps              # Service status
docker exec -it <name> bash    # Shell into a container
```

### Environment Variable Naming Convention

```
SIMPLE_VAR       → settings.simple_var        (flat)
PREFIX__FIELD    → settings.prefix.field      (nested via __)
```

### Port Map

| Port  | Service                |
| ----- | ---------------------- |
| 8000  | FastAPI API            |
| 5432  | PostgreSQL (app data)  |
| 9200  | OpenSearch REST API    |
| 6379  | Redis (app cache)      |
| 11434 | Ollama LLM             |
| 8080  | Airflow Web UI         |
| 3001  | Langfuse Web UI        |
| 5601  | OpenSearch Dashboards  |
| 5433  | Langfuse PostgreSQL    |
| 6380  | Langfuse Redis         |
| 9090  | Langfuse MinIO API     |
| 9091  | Langfuse MinIO Console |

---

> **You now have everything you need to understand, set up, and extend this project for ResearchHub.** Start with `make start`, verify with the health checks, and then begin building your feature services one at a time.
