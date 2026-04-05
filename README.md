<div align="center">

# 🔬 ResearchHub AI

### An AI-powered research assistant for the modern academic

Chat with your research corpus. Discover papers. Get cited answers — instantly.

[![CI/CD](https://github.com/youhorng/researchhub-ai-rag-system-final-year-project/actions/workflows/deploy.yml/badge.svg)](https://github.com/youhorng/researchhub-ai-rag-system-final-year-project/actions/workflows/deploy.yml)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![OpenSearch](https://img.shields.io/badge/OpenSearch-2.19-005EB8?logo=opensearch&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## 📖 Table of Contents

- [The Problem](#-the-problem)
- [The Solution](#-the-solution)
- [Features](#-features)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [How It Works — End to End](#-how-it-works--end-to-end)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Development Commands](#-development-commands)
- [Deployment & CI/CD](#-deployment--cicd)
- [Limitations](#-limitations)
- [Future Improvements](#-future-improvements)

---

## 🎯 The Problem

Academic research has a **discovery and synthesis problem**.

Researchers face a flood of publications — arXiv alone publishes thousands of papers every month across computer science and machine learning. Keeping up is practically impossible. Beyond discovery, there is an equally hard synthesis problem: once you have found relevant papers, you still need to read them, extract key ideas, and connect them to your own research questions. That work is **slow, manual, and fragmented** across browser tabs, PDFs, and personal notes.

Existing tools address pieces of this: search engines find papers, reference managers store them, and document readers display them. But none of them let you *talk* to your research corpus — asking questions like *"what methods have been proposed for few-shot learning in medical imaging?"* and getting a grounded, cited answer from the papers you actually care about.

---

## 💡 The Solution

ResearchHub AI is a full-stack web application that integrates **paper discovery**, **knowledge base management**, and **AI-powered conversation** into a single research workflow.

> **For a non-technical reader:** Think of it as a research assistant that has read all of your papers. You give it a question, and it finds the most relevant passages across everything in your knowledge base, synthesises an answer, and tells you exactly which papers it drew from — so you can verify the claims yourself.

> **For a technical reader:** The system is a production RAG pipeline combining hybrid BM25 + KNN vector search (OpenSearch), LangGraph-orchestrated agent nodes (`guardrail → retrieve → grade → rewrite → generate`), streaming Server-Sent Events to the browser, and a daily Airflow ingestion pipeline that keeps the index fresh with new arXiv papers embedded via OpenAI `text-embedding-3-small`.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Global Paper Discovery** | Search 700k+ indexed arXiv papers using hybrid semantic + keyword search. Filter by category, year range, and relevance. |
| 🗂️ **Project Workspaces** | Create research projects with a name, description, and research goal. Each project has its own scoped knowledge base. |
| 📚 **Knowledge Base Management** | Accept papers from arXiv or upload your own PDFs. Both are chunked, embedded, and made searchable. |
| 🏷️ **Topic Organisation** | Define topics within a project with keywords, arXiv categories, and date ranges to organise and scope your papers. |
| 🤖 **AI Chat with Citations** | Ask natural language questions and receive streamed AI answers with inline `[N]` citations linked to exact source passages. |
| 📊 **Analytics Dashboard** | Charts tracking papers, documents, and chat activity over time with category and per-project breakdowns. |
| 🕒 **Activity Feed** | Full audit trail of every action across all your projects — paper accepted, document uploaded, session started, and more. |
| ⚙️ **Automated Paper Ingestion** | An Airflow DAG runs daily to fetch new arXiv papers, generate embeddings, and bulk-index them into OpenSearch. |

---

## 🏗️ System Architecture

```
                         ┌──────────────────────────────┐
                         │         Browser (React)       │
                         └──────────────┬───────────────┘
                                        │ HTTPS (Cloudflare CDN)
                         ┌──────────────▼───────────────┐
                         │      Nginx (port 80/443)      │
                         │   Reverse proxy + TLS term.   │
                         └──────────┬──────────┬─────────┘
                                    │          │
                    ┌───────────────▼──┐   ┌───▼────────────────┐
                    │  FastAPI (8000)   │   │  Frontend Nginx     │
                    │  REST + SSE API   │   │  React SPA (3000)   │
                    └───┬──────────────┘   └────────────────────┘
                        │
          ┌─────────────┼──────────────────────┐
          │             │                      │
 ┌────────▼──────┐ ┌────▼──────────┐ ┌─────────▼──────┐
 │  PostgreSQL   │ │  OpenSearch   │ │     MinIO       │
 │  (port 5432)  │ │  (port 9200)  │ │  (port 9000)   │
 │  Users, proj  │ │  702k papers  │ │  PDF storage   │
 │  papers, chat │ │  + chunks     │ │                │
 └───────────────┘ └───────────────┘ └────────────────┘

          ┌────────────────────────────────────────────┐
          │              External Services             │
          │   OpenAI API  ·  Clerk Auth  ·  Langfuse   │
          └────────────────────────────────────────────┘

          ┌────────────────────────────────────────────┐
          │       Apache Airflow (port 8080)            │
          │       Daily arXiv ingestion DAGs            │
          └────────────────────────────────────────────┘
```

> All services run in Docker containers on a single DigitalOcean Droplet in production, orchestrated via Docker Compose.

---

## 🛠️ Tech Stack

<details>
<summary><strong>Frontend</strong></summary>

| Technology | Version | Purpose |
|---|---|---|
| React | 19 | Single-page application |
| TypeScript | 5.9 | Type safety |
| Vite | 7 | Build tool + dev server |
| Tailwind CSS | 3.4 | Utility-first styling |
| React Router | 7 | Client-side routing |
| Recharts | 3 | Analytics charts |
| react-markdown | 10 | Render streamed AI responses |

</details>

<details>
<summary><strong>Backend</strong></summary>

| Technology | Version | Purpose |
|---|---|---|
| FastAPI | 0.115 | REST + SSE API server |
| Python | 3.12 | Language |
| LangGraph | 0.2 | Agent graph orchestration |
| LangChain | 0.3 | LLM integration utilities |
| SQLAlchemy | 2.0 | ORM |
| Alembic | 1.13 | Database migrations |
| Pydantic | 2 | Request/response validation |
| uv | latest | Fast Python package manager |

</details>

<details>
<summary><strong>Data & Storage</strong></summary>

| Technology | Version | Purpose |
|---|---|---|
| PostgreSQL | 16 | Relational data — users, projects, papers, chat |
| OpenSearch | 2.19 | Vector + BM25 hybrid search (702k papers) |
| MinIO | latest | S3-compatible object store for uploaded PDFs |

</details>

<details>
<summary><strong>AI / ML</strong></summary>

| Technology | Purpose |
|---|---|
| OpenAI `text-embedding-3-small` | 1024-dim paper + chunk embeddings |
| OpenAI `gpt-4o-mini` | Guardrail classification, doc grading, query rewriting, answer generation |
| OpenSearch RRF pipeline | Reciprocal Rank Fusion for hybrid BM25 + KNN search |

</details>

<details>
<summary><strong>Infrastructure & DevOps</strong></summary>

| Technology | Purpose |
|---|---|
| Docker + Docker Compose | Containerised services (dev + prod configs) |
| Apache Airflow 2.10.3 | Scheduled paper ingestion pipelines |
| Nginx (alpine) | Reverse proxy, TLS termination, SPA routing |
| Cloudflare | DNS, CDN, DDoS protection, HTTPS at the edge |
| DigitalOcean Droplet | Production host (2 GB RAM) |
| GitHub Actions | CI/CD pipeline with security scanning |
| Clerk | JWT-based user authentication |
| Langfuse | LLM trace instrumentation + observability |

</details>

---

## 🔄 How It Works — End to End

### 🔍 Flow 1 — Discovering Papers

> **Plain English:** Type a research topic in the Explore page and instantly see the most relevant papers from 700k+ indexed arXiv articles.

**Technical flow:**
1. Browser sends `GET /api/v1/explore/search?q=<query>&categories=...&page=1`
2. Backend builds an OpenSearch hybrid query — BM25 full-text matching on `title` and `abstract` combined with KNN cosine similarity against `abstract_vector` (1024-dim)
3. The `hybrid-rrf-pipeline` (Reciprocal Rank Fusion) normalises and merges both ranked lists into one relevance-ordered result
4. Paginated paper metadata is returned to the browser

---

### 📚 Flow 2 — Building a Knowledge Base

> **Plain English:** Accept papers into your project or upload your own PDFs. The system reads them, breaks them into pieces, and makes them searchable for AI chat.

**Accepting an arXiv paper:**
1. `PATCH /api/v1/projects/{id}/papers/{paper_id}` sets `status = "accepted"`
2. A FastAPI `BackgroundTask` runs `index_paper_chunks()`:
   - Downloads the PDF from arXiv via `httpx`
   - Parses text with PyMuPDF (up to 40 pages)
   - Splits into **600-char chunks** with **100-char overlap**, breaking on sentence boundaries
   - Batch-embeds chunks (50 at a time) with `text-embedding-3-small` → 1024-dim vectors
   - Bulk-indexes into OpenSearch `arxiv-papers-chunks`, tagged with `project_id` for scoped retrieval

**Uploading a PDF:**
1. `POST /api/v1/projects/{id}/documents` receives a multipart file upload
2. File is stored in MinIO under `{project_id}/{doc_id}/{filename}`
3. A `BackgroundTask` runs `index_document_chunks()` — same parse → chunk → embed → index pipeline
4. `Document.chunks_indexed` is set to `true` in PostgreSQL once complete

---

### 🤖 Flow 3 — AI Chat with Citations

> **Plain English:** Ask a question. The AI searches your knowledge base, reads the most relevant passages, writes a grounded answer, and tells you which papers it used — all streamed live to your screen.

**Technical flow:**

`POST /api/v1/projects/{id}/chat/sessions/{session_id}/messages` triggers `run_rag_pipeline()`, returning an async SSE generator.

The LangGraph agent state machine runs:

```
┌──────────┐     ┌──────────┐     ┌────────────┐     ┌───────────────┐
│ guardrail│────▶│ retrieve │────▶│ grade_docs │────▶│ rewrite_query │
└──────────┘     └──────────┘     └────────────┘     └───────┬───────┘
                      ▲                                       │ (loop once)
                      └───────────────────────────────────────┘
```

| Node | What it does |
|---|---|
| 🛡️ **guardrail** | Classifies the query as `conversational`, `research`, or `off_topic` relative to the project's research goal. Off-topic queries are rejected gracefully. |
| 🔎 **retrieve** | Embeds the query, runs hybrid BM25 + KNN search across the project's chunks (top 15 hits), then fills gaps to ensure at least one chunk per paper/document is represented. |
| ✅ **grade_docs** | LLM scores each chunk for relevance. Irrelevant chunks are filtered out. Keeps all chunks as fallback if all are filtered. |
| ✏️ **rewrite_query** | If grading produced no relevant chunks, the LLM suggests a better query formulation and retrieval retries once. |

After the graph completes:
- A system prompt is built from graded chunks + knowledge base inventory
- `gpt-4o-mini` streams a response via the OpenAI async SDK — each delta yields a `chunk` SSE event
- Citation markers `[N]` are renumbered to match only sources referenced in the final response
- A non-blocking hallucination check runs in the background (Langfuse observability only)
- The assistant message with `cited_sources` (JSONB), token counts, and latency is persisted to PostgreSQL

---

### ⚙️ Flow 4 — Automated Daily Ingestion

> **Plain English:** New arXiv papers are automatically discovered and added to the searchable index every day.

**Technical flow:**
1. Airflow DAG `arxiv_daily_update` runs on a `@daily` schedule
2. Queries the arXiv API for up to 100 new papers across 16 target CS/ML categories
3. Papers already in PostgreSQL (by `arxiv_id`) are skipped
4. Title + abstract is embedded with `text-embedding-3-small`
5. Records bulk-inserted into PostgreSQL and bulk-indexed into OpenSearch with vectors
6. A separate DAG (`arxiv_bulk_load_batch`) handles large historical loads via the OpenAI Batch API — cost-efficient 24-hour completion window with polling and resume-on-failure semantics

---

## 📁 Project Structure

```
researchhub-ai-rag-system-final-year-project/
├── 📄 compose.yml                   # Development Docker Compose
├── 📄 compose.prod.yml              # Production Docker Compose
├── 📄 Makefile                      # Developer commands
├── 📄 .env.example                  # Environment variable template
│
├── 📂 backend/
│   ├── 📂 src/
│   │   ├── main.py                  # FastAPI app entry point
│   │   ├── config.py                # Pydantic settings (all env vars)
│   │   ├── dependencies.py          # Shared FastAPI dependencies
│   │   ├── 📂 routers/              # HTTP handlers (one file per domain)
│   │   ├── 📂 repositories/         # SQLAlchemy data-access functions
│   │   └── 📂 services/
│   │       ├── rag/pipeline.py      # ⭐ Core RAG pipeline (SSE streaming)
│   │       ├── 📂 agents/           # LangGraph nodes + graph definition
│   │       ├── 📂 opensearch/       # Query builder + index config
│   │       ├── 📂 embeddings/       # OpenAI text-embedding-3-small wrapper
│   │       ├── 📂 indexing/         # Text chunker + document/paper indexer
│   │       ├── 📂 pdf_parser/       # PyMuPDF PDF text extraction
│   │       └── 📂 storage/          # MinIO client
│   ├── 📂 airflow/dags/
│   │   ├── arxiv_daily_update.py    # Daily ingestion DAG
│   │   └── arxiv_bulk_load_batch.py # Historical bulk-load DAG
│   ├── 📂 alembic/                  # Database migrations
│   └── 🐳 Dockerfile                # Multi-stage build (uv → python:3.12-slim)
│
├── 📂 frontend/
│   ├── 📂 src/
│   │   ├── 📂 layouts/              # DashboardLayout, ProjectLayout, AuthLayout
│   │   ├── 📂 pages/                # One file per route
│   │   └── 📂 components/modals/    # NewProjectModal, AddToProjectModal, etc.
│   ├── nginx.conf                   # SPA routing + static asset caching
│   └── 🐳 Dockerfile                # Multi-stage (node:20 → nginx:alpine)
│
├── 📂 nginx/
│   └── nginx.conf                   # Reverse proxy, TLS, security headers
│
├── 📂 scripts/
│   ├── deploy.sh                    # Production deployment + rollback script
│   └── 01_create_databases.sh       # PostgreSQL init (rag_db + airflow_db)
│
└── 📂 .github/workflows/
    └── deploy.yml                   # GitHub Actions CI/CD pipeline
```

---

## 🚀 Getting Started

### Prerequisites

Before you begin, make sure you have:

- 🐳 [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- `make` — comes with macOS/Linux; Windows users should use WSL
- 🔑 An [OpenAI API key](https://platform.openai.com/api-keys)
- 🔐 A [Clerk account](https://clerk.com) (free tier works)

### Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd researchhub-ai-rag-system-final-year-project

# 2. Copy the environment template and fill in required values
cp .env.example .env
```

Open `.env` and set at minimum:

```env
OPENAI_API_KEY=sk-...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_JWKS_URL=https://...clerk.accounts.dev/.well-known/jwks.json
```

```bash
# 3. Build images and start all services
make start

# 4. Apply database migrations
make db-upgrade

# 5. Open the app
open http://localhost:3000
```

> [!NOTE]
> The first startup pulls all base images (Postgres, OpenSearch, MinIO, Airflow). OpenSearch may take **30–60 seconds** to become ready. Run `make health` to verify all services are up.

> [!IMPORTANT]
> The OpenSearch index mapping is created automatically by the API on startup (`index_config.py`). **Do not** let OpenSearch auto-create the index — incorrect field types (`float` instead of `knn_vector`) will break vector search.

---

## 🧑‍💻 Development Commands

All commands are defined in the `Makefile` and run from the repo root.

### Service Management

```bash
make start        # Build images and start all services
make stop         # Stop services (keeps volumes / data intact)
make restart      # Restart all services
make status       # Show running containers and exposed ports
make logs         # Stream logs from all services
make logs-api     # Stream API logs only
make health       # Check health of API, OpenSearch, and Airflow
```

### Backend Quality (run from `backend/`)

```bash
make setup        # Install Python dependencies via uv sync
make format       # Format code with ruff
make lint         # Lint + type check (ruff + mypy)
make test         # Run pytest
make test-cov     # Run pytest with HTML coverage report
```

### Database Migrations

```bash
make db-migrate msg="add index to papers"   # Generate a new migration
make db-upgrade                              # Apply all pending migrations
make db-downgrade                            # Roll back the last migration
make db-history                              # Show migration history
```

### Applying Code Changes

> The API and frontend containers bake code at build time — live-mounting is not used.

```bash
# After any backend change:
docker compose up --build -d api

# After any frontend change:
docker compose up --build -d frontend
```

---

## 🚢 Deployment & CI/CD

ResearchHub AI uses a **GitHub Actions → GHCR → DigitalOcean Droplet** pipeline with automated security scanning at every stage.

### Pipeline Overview

Every push to `main` triggers the following workflow:

```
📦 Push to main
        │
        ▼  ─────────────── Security Gates (parallel) ───────────────
        ├─ 🔐 Secret scan       Gitleaks scans full git history
        ├─ 🛡️  SAST              Bandit (Python) + Semgrep (OWASP Top 10)
        ├─ 📦 Dependency scan   pip-audit (backend) + npm audit (frontend)
        └─ 📊 Code quality      SonarCloud static analysis
        │
        ▼  ─────────── Docker Builds (parallel, GHA cache) ──────────
        ├─ 🐳 Build API image      uv → python:3.12-slim multi-stage
        ├─ 🐳 Build Frontend       node:20 → nginx:alpine multi-stage
        └─ 🐳 Build Airflow        Airflow 2.10.3 + project deps
        │
        ▼  ───────── Container & IaC Scanning (parallel) ────────────
        ├─ 🔍 Trivy scan API image
        ├─ 🔍 Trivy scan Frontend image
        ├─ 🔍 Trivy scan Airflow image
        └─ 🔍 Trivy IaC scan compose.prod.yml
        │
        ▼  Push to GitHub Container Registry (GHCR)
           Tags: :latest  ·  :sha-<commit>  (immutable, used for rollback)
        │
        ▼  Deploy to DigitalOcean Droplet  [environment: production]
           SSH → scripts/deploy.sh IMAGE_TAG=sha-<commit>
               ├─ Record current image tag  ← rollback anchor
               ├─ git pull latest code (compose, nginx config, DAGs)
               ├─ docker compose pull from GHCR
               ├─ docker compose up -d --remove-orphans
               ├─ nginx -s reload  (zero-downtime; re-resolves container IPs)
               ├─ Wait for PostgreSQL readiness
               ├─ alembic upgrade head  (idempotent schema migrations)
               ├─ docker image prune  (free disk space)
               └─ ❌ On any error → automatic rollback to previous tag
```

### 🔒 Secrets Management

| Location | What is stored |
|---|---|
| **GitHub Secrets** | `DROPLET_SSH_KEY`, `DROPLET_HOST`, `DROPLET_USER`, `SONAR_TOKEN`, `VITE_CLERK_PUBLISHABLE_KEY` |
| **Droplet `.env`** | All runtime secrets — OpenAI API key, Clerk secret, DB passwords, Langfuse keys. Never committed to git. |
| **Droplet `nginx/certs/`** | Cloudflare Origin Certificate + private key. Never in git. |

### 🌐 Production Infrastructure

HTTPS is terminated at **Cloudflare** (CDN + DDoS protection). Cloudflare forwards requests to the Droplet using an Origin Certificate — traffic is encrypted end-to-end.

Nginx on the Droplet:
- Enforces strict security headers (`HSTS`, `X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy`)
- Disables proxy buffering on `/api/` routes — essential for **SSE streaming** chat responses
- Uses `resolver 127.0.0.11 valid=10s` (Docker's internal DNS) so rolling deploys don't require an nginx restart

All internal services (PostgreSQL, MinIO, Airflow UI, OpenSearch Dashboards, Uptime Kuma) are **firewalled from the public internet** and accessed only via SSH port-forwarding.

### 🏷️ Image Tagging Strategy

Each build produces two tags:
- `:latest` — mutable, always points to the most recent successful deployment
- `:sha-<commit>` — immutable, used for pinned production deployments and rollbacks

The deploy script captures the current tag before switching. Any failure triggers an automatic pull-and-restart of the previous tag.

---

## ⚠️ Limitations

| Limitation | Details |
|---|---|
| 📄 **PDF parsing is text-only** | PyMuPDF extracts raw text. Scanned PDFs, complex LaTeX math, and multi-column layouts may parse incorrectly or produce garbled output. |
| 🧠 **RAG context is bounded** | Retrieval fetches up to 15 chunks per query. Very long papers or large knowledge bases may not surface all relevant passages in a single turn. |
| 🔄 **No mid-session KB updates** | Papers accepted or documents uploaded during an active conversation are not available until the next query is issued. |
| 🗂️ **Single-project scope per session** | Each chat session is scoped to one project's knowledge base. Cross-project synthesis is not supported. |
| ⚙️ **Single-machine Airflow** | LocalExecutor means DAGs cannot be distributed. Large bulk-load jobs run sequentially on the Droplet. |
| 🔄 **No indexing progress visibility** | After accepting a paper or uploading a document, indexing is a background process with no progress bar — only a final `chunks_indexed = true` state. |

---

## 🔭 Future Improvements

- 📷 **OCR and richer PDF parsing** — Integrate Marker or Docling with OCR support to handle scanned documents and extract LaTeX math meaningfully.

- 🌐 **Cross-project synthesis** — Allow a single chat session to query across multiple project knowledge bases simultaneously for broader literature synthesis.

- 📡 **More data sources** — Extend ingestion beyond arXiv to Semantic Scholar, PubMed, IEEE Xplore, and ACL Anthology.

- 📈 **RAG evaluation harness** — Instrument the pipeline with faithfulness, answer relevance, and context precision metrics (e.g., RAGAS) to continuously monitor and improve answer quality.

- 👥 **Shared workspaces and team roles** — Allow multiple users to collaborate within a single project with fine-grained permission levels (viewer, contributor, admin).

- 💬 **Long-term conversation memory** — Summarise older turns into a compressed memory block so the AI maintains continuity across sessions without exhausting the context window.

- 📊 **Citation graph visualisation** — Render an interactive graph showing how papers within a project cite each other, surfacing foundational and highly-cited works.

- ⚡ **Horizontal Airflow scaling** — Replace LocalExecutor with CeleryExecutor or migrate DAGs to a managed service (Astronomer, Cloud Composer) for parallel execution.

- 🔁 **Zero-downtime vector reindexing** — Implement an alias-swap strategy so the OpenSearch index can be rebuilt in the background and promoted atomically without a search outage.

---

<div align="center">

Built as a final-year project — combining modern AI, search infrastructure, and production DevOps practices.

</div>
