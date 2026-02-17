# ResearchHub Monorepo Infrastructure Setup Guide

Welcome to the infrastructure setup phase of your **Final Year Project**! As your mentor, I've prepared this step-by-step guide to help you build the Docker & CI/CD foundation for ResearchHub.

This guide is designed for you to **implement by hand**. Copy-pasting is allowed, but try to understand _why_ each line exists.

---

## Phase 1: Dockerizing the Backend

Your backend uses `uv` and FastAPI. We need a Dockerfile that leverages `uv`'s speed and capabilities.

### Step 1: Create `backend/Dockerfile`

Create a file named `Dockerfile` inside your `backend/` folder.

**Key Concepts:**

- **Multi-stage build**: We use a "builder" stage to install dependencies and a "runner" stage for the final image. This keeps the image small.
- **uv**: We use the official `ghcr.io/astral-sh/uv` image to get `uv` pre-installed.

```dockerfile
# -----------------------------------------------------------------------------
# Stage 1: Builder (Install dependencies)
# -----------------------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Copy dependency files first (for better caching)
COPY pyproject.toml uv.lock ./

# Install dependencies into a virtual environment
# --frozen: strict sync from uv.lock
# --no-dev: production deps only
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# -----------------------------------------------------------------------------
# Stage 2: Runner (Final Image)
# -----------------------------------------------------------------------------
FROM python:3.12-slim-bookworm

WORKDIR /app

# Copy the virtual environment from the builder stage
COPY --from=builder /app/.venv /app/.venv

# Add venv to PATH so we don't need to type "source ..."
ENV PATH="/app/.venv/bin:$PATH"

# Copy your application code
COPY src ./src
# If you have other files like alembic.ini, copy them too:
# COPY alembic.ini .

# Create a non-root user for security (optional but recommended)
# RUN useradd -m researchhub && chown -R researchhub /app
# USER researchhub

# Expose the port (documentation only)
EXPOSE 8000

# Command to run the application
# We use "src.main:app" assuming your entry point is inside src/main.py
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Phase 2: Dockerizing the Frontend

Your frontend is a Vite + React app. For production, we don't run a development server. We **build** static HTML/JS/CSS files and serve them with Nginx.

### Step 2: Create `frontend/Dockerfile`

Create a file named `Dockerfile` inside your `frontend/` folder.

```dockerfile
# -----------------------------------------------------------------------------
# Stage 1: Build (Node.js)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the static site (creates /app/dist)
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Serve (Nginx)
# -----------------------------------------------------------------------------
FROM nginx:alpine

# Copy the build output from the builder stage to Nginx's web root
COPY --from=builder /app/dist /usr/share/nginx/html

# (Optional) Copy custom nginx config if we need to handle React Router paths
# COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Mentorship Tip:** If you notice your frontend returns "404 Not Found" when you refresh a page on a specific route (like `/dashboard`), it's because Nginx doesn't know about client-side routing. We might need to add a custom `nginx.conf` later to redirect all requests to `index.html`.

---

## Phase 3: Orchestrating with Docker Compose

Now we tie everything together. This is where your `.env` file becomes crucial.

### Step 3: Create `compose.yml`

Create (or overwrite) the `compose.yml` in your **root** directory.

```yaml
services:
  # ---------------------------------------------------------------------------
  # 1. Backend Service (FastAPI)
  # ---------------------------------------------------------------------------
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: researchhub-api
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
      opensearch:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD-SHELL",
          'python -c "import urllib.request; urllib.request.urlopen(''http://localhost:8000/api/v1/health'')"',
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    env_file:
      - .env
    environment:
      # Container-specific overrides for Docker networking
      - OPENSEARCH_HOST=http://opensearch:9200
      - OPENSEARCH__HOST=http://opensearch:9200
      - OLLAMA_HOST=http://ollama:11434
      - POSTGRES_DATABASE_URL=postgresql+psycopg2://rag_user:rag_password@postgres:5432/rag_db
      - LANGFUSE_HOST=http://langfuse-web:3000
      - LANGFUSE_DEBUG=true
      - REDIS__HOST=redis
    networks:
      - rag-network

  # ---------------------------------------------------------------------------
  # 2. Frontend Service (React/Vite)
  # ---------------------------------------------------------------------------
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: researchhub-frontend
    ports:
      - "3000:80"
    depends_on:
      - api
    networks:
      - rag-network

  # ---------------------------------------------------------------------------
  # 3. Core Infrastructure (DBs, Cache, Search)
  # ---------------------------------------------------------------------------
  postgres:
    image: postgres:16-alpine
    container_name: rag-postgres
    environment:
      - POSTGRES_DB=rag_db
      - POSTGRES_USER=rag_user
      - POSTGRES_PASSWORD=rag_password
      - POSTGRES_HOST_AUTH_METHOD=password
      - PGDATA=/var/lib/postgresql/data/pgdata
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rag_user -d rag_db"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 30s
    restart: unless-stopped
    networks:
      - rag-network

  redis:
    image: redis:7-alpine
    container_name: rag-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 10s
    restart: unless-stopped
    networks:
      - rag-network

  opensearch:
    image: opensearchproject/opensearch:2.19.0
    container_name: rag-opensearch
    environment:
      - discovery.type=single-node
      - OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m
      - DISABLE_SECURITY_PLUGIN=true
      - bootstrap.memory_lock=true
    ports:
      - "9200:9200"
      - "9600:9600"
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - opensearch_data:/usr/share/opensearch/data
    healthcheck:
      test:
        ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    restart: unless-stopped
    networks:
      - rag-network

  opensearch-dashboards:
    image: opensearchproject/opensearch-dashboards:2.19.0
    container_name: rag-dashboards
    ports:
      - "5601:5601"
    environment:
      - OPENSEARCH_HOSTS=http://opensearch:9200
      - DISABLE_SECURITY_DASHBOARDS_PLUGIN=true
    depends_on:
      - opensearch
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:5601/api/status || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    networks:
      - rag-network

  ollama:
    image: ollama/ollama:0.11.2
    container_name: rag-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    healthcheck:
      test: ["CMD", "ollama", "list"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - rag-network

  # ---------------------------------------------------------------------------
  # 4. Pipeline & Observability (Airflow, Langfuse)
  # ---------------------------------------------------------------------------
  # Note: Requires ./airflow directory with Dockerfile
  airflow:
    build:
      context: ./airflow
      dockerfile: Dockerfile
    container_name: rag-airflow
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - .env
    environment:
      - AIRFLOW_HOME=/opt/airflow
      - PYTHONPATH=/opt/airflow/src
      - POSTGRES_DATABASE_URL=postgresql+psycopg2://rag_user:rag_password@postgres:5432/rag_db
      - OPENSEARCH_HOST=http://opensearch:9200
      - OPENSEARCH__HOST=http://opensearch:9200
      - OLLAMA_HOST=http://ollama:11434
      - REDIS__HOST=redis
    volumes:
      - ./airflow/dags:/opt/airflow/dags
      - airflow_logs:/opt/airflow/logs
      - ./airflow/plugins:/opt/airflow/plugins
      - ./src:/opt/airflow/src
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 120s
    networks:
      - rag-network

  clickhouse:
    image: clickhouse/clickhouse-server:24.8-alpine
    container_name: rag-clickhouse
    environment:
      - CLICKHOUSE_DB=langfuse
      - CLICKHOUSE_USER=langfuse
      - CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1
      - CLICKHOUSE_PASSWORD=langfuse
    volumes:
      - clickhouse_data:/var/lib/clickhouse
    healthcheck:
      test: ["CMD", "clickhouse-client", "--query", "SELECT 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    restart: unless-stopped
    networks:
      - rag-network

  langfuse-worker:
    image: docker.io/langfuse/langfuse-worker:3
    container_name: rag-langfuse-worker
    restart: unless-stopped
    depends_on:
      langfuse-postgres:
        condition: service_healthy
      langfuse-minio:
        condition: service_healthy
      langfuse-redis:
        condition: service_healthy
      clickhouse:
        condition: service_healthy
    ports:
      - "3030:3030"
    environment:
      NEXTAUTH_URL: http://localhost:3001
      DATABASE_URL: postgresql://langfuse:langfuse@langfuse-postgres:5432/langfuse
      SALT: ${LANGFUSE_SALT}
      ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY}
      TELEMETRY_ENABLED: "false"
      LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: "true"
      CLICKHOUSE_MIGRATION_URL: clickhouse://clickhouse:9000
      CLICKHOUSE_URL: http://clickhouse:8123
      CLICKHOUSE_USER: langfuse
      CLICKHOUSE_PASSWORD: langfuse
      CLICKHOUSE_CLUSTER_ENABLED: "false"
      LANGFUSE_USE_AZURE_BLOB: "false"
      LANGFUSE_S3_EVENT_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_REGION: auto
      LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: ${LANGFUSE_MINIO_ACCESS_KEY}
      LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: ${LANGFUSE_MINIO_SECRET_KEY}
      LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: http://langfuse-minio:9000
      LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_S3_EVENT_UPLOAD_PREFIX: events/
      LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_MEDIA_UPLOAD_REGION: auto
      LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: ${LANGFUSE_MINIO_ACCESS_KEY}
      LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: ${LANGFUSE_MINIO_SECRET_KEY}
      LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: http://localhost:9090
      LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: media/
      REDIS_HOST: langfuse-redis
      REDIS_PORT: 6379
      REDIS_AUTH: ${LANGFUSE_REDIS_PASSWORD}
      REDIS_TLS_ENABLED: "false"
    networks:
      - rag-network

  langfuse-web:
    image: docker.io/langfuse/langfuse:3
    container_name: rag-langfuse-web
    restart: unless-stopped
    depends_on:
      langfuse-postgres:
        condition: service_healthy
      langfuse-minio:
        condition: service_healthy
      langfuse-redis:
        condition: service_healthy
      clickhouse:
        condition: service_healthy
    ports:
      - "3001:3000"
    environment:
      NEXTAUTH_URL: http://localhost:3001
      NEXTAUTH_SECRET: ${LANGFUSE_NEXTAUTH_SECRET}
      DATABASE_URL: postgresql://langfuse:langfuse@langfuse-postgres:5432/langfuse
      SALT: ${LANGFUSE_SALT}
      ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY}
      TELEMETRY_ENABLED: "false"
      LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: "true"
      CLICKHOUSE_MIGRATION_URL: clickhouse://clickhouse:9000
      CLICKHOUSE_URL: http://clickhouse:8123
      CLICKHOUSE_USER: langfuse
      CLICKHOUSE_PASSWORD: langfuse
      CLICKHOUSE_CLUSTER_ENABLED: "false"
      LANGFUSE_USE_AZURE_BLOB: "false"
      LANGFUSE_S3_EVENT_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_REGION: auto
      LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: ${LANGFUSE_MINIO_ACCESS_KEY}
      LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: ${LANGFUSE_MINIO_SECRET_KEY}
      LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: http://langfuse-minio:9000
      LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_S3_EVENT_UPLOAD_PREFIX: events/
      LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_MEDIA_UPLOAD_REGION: auto
      LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: ${LANGFUSE_MINIO_ACCESS_KEY}
      LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: ${LANGFUSE_MINIO_SECRET_KEY}
      LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: http://localhost:9090
      LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: media/
      REDIS_HOST: langfuse-redis
      REDIS_PORT: 6379
      REDIS_AUTH: ${LANGFUSE_REDIS_PASSWORD}
      REDIS_TLS_ENABLED: "false"
      LANGFUSE_INIT_ORG_NAME: "RAG Organization"
      LANGFUSE_INIT_PROJECT_NAME: "Agentic RAG"
      LANGFUSE_INIT_USER_EMAIL: "admin@example.com"
      LANGFUSE_INIT_USER_NAME: "Admin User"
      LANGFUSE_INIT_USER_PASSWORD: "admin123"
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "curl -f http://localhost:3000/api/public/health || exit 1",
        ]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    networks:
      - rag-network

  langfuse-postgres:
    image: postgres:17
    container_name: rag-langfuse-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=langfuse
      - POSTGRES_PASSWORD=langfuse
      - POSTGRES_DB=langfuse
      - POSTGRES_HOST_AUTH_METHOD=password
      - TZ=UTC
      - PGTZ=UTC
    ports:
      - "5433:5432"
    volumes:
      - langfuse_v3_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U langfuse -d langfuse"]
      interval: 3s
      timeout: 3s
      retries: 10
      start_period: 30s
    networks:
      - rag-network

  langfuse-redis:
    image: docker.io/redis:7
    container_name: rag-langfuse-redis
    restart: unless-stopped
    command: --requirepass langfuse_redis_password
    ports:
      - "6380:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "langfuse_redis_password", "ping"]
      interval: 3s
      timeout: 10s
      retries: 10
    networks:
      - rag-network

  langfuse-minio:
    image: docker.io/minio/minio
    container_name: rag-langfuse-minio
    restart: unless-stopped
    entrypoint: sh
    command: -c 'mkdir -p /data/langfuse && minio server --address ":9000" --console-address ":9001" /data'
    environment:
      - MINIO_ROOT_USER=langfuse_minio
      - MINIO_ROOT_PASSWORD=langfuse_minio_secret
    ports:
      - "9090:9000"
      - "9091:9001"
    volumes:
      - langfuse_v3_minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 5s
    networks:
      - rag-network

volumes:
  postgres_data:
  opensearch_data:
  ollama_data:
  airflow_logs:
  clickhouse_data:
  redis_data:
  langfuse_v3_postgres_data:
  langfuse_v3_minio_data:

networks:
  rag-network:
    driver: bridge
```

---

## Phase 4: CI/CD Pipeline (GitHub Actions)

We want to ensure that every time you push code, we check if it breaks.

### Step 4: Create `.github/workflows/ci-cd.yml`

Create setting up the folder structure `.github/workflows/` and add `ci-cd.yml`.

```yaml
name: ResearchHub CI/CD

on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]

jobs:
  # ---------------------------------------------------------------------------
  # Backend Quality Checks
  # ---------------------------------------------------------------------------
  backend-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "latest"

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version-file: "backend/pyproject.toml"

      - name: Install Dependencies
        working-directory: ./backend
        run: uv sync --all-extras --dev

      - name: Lint with Ruff
        working-directory: ./backend
        run: uv run ruff check .

      - name: Format Check
        working-directory: ./backend
        run: uv run ruff format --check .

      - name: Run Tests
        working-directory: ./backend
        # Assuming you have a .env.test or similar for CI
        run: uv run pytest

  # ---------------------------------------------------------------------------
  # Frontend Quality Checks
  # ---------------------------------------------------------------------------
  frontend-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install Dependencies
        working-directory: ./frontend
        run: npm ci

      - name: Lint
        working-directory: ./frontend
        run: npm run lint

      - name: Build Test
        working-directory: ./frontend
        run: npm run build

  # ---------------------------------------------------------------------------
  # Infrastructure Check (Does it build?)
  # ---------------------------------------------------------------------------
  docker-build-check:
    runs-on: ubuntu-latest
    needs: [backend-checks, frontend-checks]
    steps:
      - uses: actions/checkout@v4

      - name: Build Backend Image
        run: docker build -t researchhub-backend ./backend

      - name: Build Frontend Image
        run: docker build -t researchhub-frontend ./frontend
```

---

## Getting Started / Verification

1.  **Implement**: Create the files as shown above.
2.  **Run**: Open your terminal in the root folder and run:
    ```bash
    docker compose up --build -d
    ```
3.  **Verify**:
    - Backend: `curl http://localhost:8000/docs` (Should show Swagger UI JSON)
    - Frontend: Open `http://localhost:3000` in your browser.
    - Database: `docker logs researchhub-backend` (Check for "Connected to database" messages)

Good luck! Let me know if you hit any errors during this process.
