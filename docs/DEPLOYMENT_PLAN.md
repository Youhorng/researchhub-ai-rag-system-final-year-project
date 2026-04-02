# Production Deployment Plan

## Context
Deploying ResearchHub to a DigitalOcean droplet (2GB RAM, 1 vCPU, 50GB SSD) with:
- GitHub Actions as CI/CD pipeline
- Domain via name.com + Cloudflare (Cloudflare handles SSL, server only needs port 80)
- Redis removed (confirmed: zero Redis references in `backend/src/` — only in compose.yml env vars)
- OpenSearch indices + MinIO bucket auto-created on API startup via `main.py` lifespan (`setup_indices` is idempotent)

---

## RAM Budget (2GB = 2048 MB)

| Service | Config | Estimated RSS |
|---|---|---|
| OpenSearch | 512m heap (↓ from 1g) | ~700 MB |
| Airflow | default | ~300 MB |
| PostgreSQL | default | ~100 MB |
| FastAPI (2 workers, ↓ from 4) | 2 workers | ~200 MB |
| MinIO | default | ~80 MB |
| nginx reverse proxy | proxy | ~15 MB |
| Frontend nginx | static | ~15 MB |
| OS + Docker | overhead | ~250 MB |
| **Total** | | **~1,660 MB** |

Dropping Redis (~60 MB), OpenSearch Dashboards (~400 MB), reducing heap and workers makes this fit.

---

## CI/CD Pipeline Overview

```
push to feature branch → PR → merge to main
              ↓
        GitHub Actions triggers
              ↓
  ┌──────────────────────────────────────────┐
  │  Jobs 1a/1b/1c (parallel — no deps):    │
  │  1a. secret-scan   (Gitleaks)            │
  │  1b. sast          (Bandit + Semgrep)    │
  │  1c. dep-scan      (pip-audit, npm audit)│
  └──────────────┬───────────────────────────┘
                 │ all must pass
                 ↓
  ┌──────────────────────────────────────────┐
  │  Job 2: build                            │
  │  - docker build api + frontend           │
  │  - tag: latest + sha-<commit>            │
  │  - load into runner daemon (not pushed)  │
  └──────────────┬───────────────────────────┘
                 ↓
  ┌──────────────────────────────────────────┐
  │  Job 3: container-scan (Trivy)           │
  │  - scan api image (OS + Python libs)     │
  │  - scan frontend image                   │
  │  - scan compose.yml IaC misconfigs       │
  └──────────────┬───────────────────────────┘
                 ↓
  ┌──────────────────────────────────────────┐
  │  Job 4: push-to-ghcr                     │
  │  - login with GITHUB_TOKEN (automatic)   │
  │  - push ghcr.io/user/repo/api:latest     │
  │  - push ghcr.io/user/repo/api:sha-xxxxx  │
  │  - push frontend similarly               │
  └──────────────┬───────────────────────────┘
                 ↓
  ┌──────────────────────────────────────────┐
  │  Job 5: deploy                           │
  │  - SSH to droplet                        │
  │  - docker compose pull (GHCR images)     │
  │  - docker compose up -d                  │
  │  - alembic upgrade head                  │
  └──────────────────────────────────────────┘
```

---

## Files to Create/Modify

| Action | File |
|---|---|
| MODIFY | `compose.yml` — delete redis service, redis volume, redis depends_on entries |
| CREATE | `compose.prod.yml` |
| CREATE | `nginx/nginx.conf` |
| CREATE | `.github/workflows/deploy.yml` |
| CREATE | `scripts/deploy.sh` |
| NO CHANGE | `frontend/nginx.conf` (already correct for SPA) |
| NO CHANGE | `frontend/Dockerfile` |
| NO CHANGE | `backend/Dockerfile` |

---

## File 0: `compose.yml` (MODIFY — delete Redis)

Remove the following from `compose.yml`:
- The entire `redis:` service block (lines ~94–110)
- `redis_data:` from the `volumes:` section
- `redis:` condition from `api.depends_on`
- `- REDIS__HOST=redis` from `api.environment`
- `- REDIS__HOST=redis` from `airflow.environment`

Redis has zero references in `backend/src/` — safe to delete entirely.

---

## File 1: `compose.prod.yml` (production override)

Layered on top of `compose.yml` at deploy time:
`docker compose -f compose.yml -f compose.prod.yml up --build -d`

Changes:
- **opensearch-dashboards**: assign to `profiles: [donotstart]` so it never starts
- **opensearch**: reduce `OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m`, remove host port exposure
- **api**: override `command` to use 2 uvicorn workers; redefine `depends_on` without redis (must completely re-declare to exclude redis — Compose merges lists, can't remove an entry); remove host port
- **airflow**: remove host port 8080 (access via SSH tunnel only); remove REDIS__HOST env var
- **frontend**: remove host port; pass `VITE_API_URL=/api` build arg (relative path, nginx routes it)
- **postgres**: remove host port 5432
- **minio**: remove host ports
- **nginx**: NEW service — nginx:alpine, exposes port 80 only, mounts `./nginx/nginx.conf`

```yaml
services:
  opensearch-dashboards:
    profiles: [donotstart]

  opensearch:
    environment:
      - discovery.type=single-node
      - OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m
      - DISABLE_SECURITY_PLUGIN=true
      - bootstrap.memory_lock=true
    ports: []

  api:
    command: ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
    depends_on:
      postgres:
        condition: service_healthy
      opensearch:
        condition: service_healthy
      minio:
        condition: service_healthy
    environment:
      - OPENSEARCH_HOST=http://opensearch:9200
      - OPENSEARCH__HOST=http://opensearch:9200
      - POSTGRES_DATABASE_URL=postgresql+psycopg2://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      - MINIO_ENDPOINT=minio:9000
    ports: []

  frontend:
    ports: []
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
        - VITE_API_URL=/api

  postgres:
    ports: []

  minio:
    ports: []

  airflow:
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - AIRFLOW__DATABASE__SQL_ALCHEMY_CONN=postgresql+psycopg2://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/airflow_db
      - OPENSEARCH_HOST=http://opensearch:9200
      - OPENSEARCH__HOST=http://opensearch:9200
      - PYTHONPATH=/opt/airflow
    ports: []

  nginx:
    image: nginx:alpine
    container_name: researchhub-nginx
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - api
      - frontend
    restart: unless-stopped
    networks:
      - rag-network
```

---

## File 2: `nginx/nginx.conf` (reverse proxy)

Routes all external traffic. Key requirements:
- `/api/` → `api:8000` with **SSE support** (`proxy_buffering off`, 300s timeouts) — critical for streaming chat
- `/` → `frontend:80`
- Cloudflare real IP passthrough headers
- Gzip compression

```nginx
events { worker_processes auto; worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    upstream api_backend   { server api:8000; }
    upstream frontend_backend { server frontend:80; }

    server {
        listen 80;
        server_name _;

        # Cloudflare real IP
        set_real_ip_from 103.21.244.0/22;
        # ... (all Cloudflare CIDRs)
        real_ip_header CF-Connecting-IP;

        location /api/ {
            proxy_pass         http://api_backend/api/;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
            # SSE streaming support
            proxy_buffering    off;
            proxy_cache        off;
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
            proxy_connect_timeout 60s;
            proxy_set_header   Connection "";  # disable keep-alive upgrade for SSE
        }

        location / {
            proxy_pass         http://frontend_backend;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_read_timeout 60s;
        }
    }
}
```

---

## File 1 (cont.): compose.prod.yml — GHCR image overrides

Since images are pre-built and pushed to GHCR in the CI pipeline, `compose.prod.yml` also overrides the `image:` field for `api` and `frontend` so the server pulls pre-built images instead of re-building:

```yaml
# In compose.prod.yml, add to api and frontend:
  api:
    image: ghcr.io/${GITHUB_REPOSITORY}/api:${IMAGE_TAG:-latest}
    # (no build: key — image: takes precedence when both are set in Compose)

  frontend:
    image: ghcr.io/${GITHUB_REPOSITORY}/frontend:${IMAGE_TAG:-latest}
```

On the server, `IMAGE_TAG` is set to the commit SHA by `scripts/deploy.sh` to pin the exact version.

---

## File 3: `.github/workflows/deploy.yml`

Full 5-job pipeline:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  API_IMAGE: ghcr.io/${{ github.repository }}/api
  FRONTEND_IMAGE: ghcr.io/${{ github.repository }}/frontend

jobs:

  # ── 1a. Secret scanning ────────────────────────────────────────────────────
  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # full history so Gitleaks can scan all commits
      - name: Gitleaks secret scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # ── 1b. SAST ───────────────────────────────────────────────────────────────
  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Bandit (Python SAST)
        run: |
          pip install bandit
          bandit -r backend/src/ -ll -x backend/src/tests/ --exit-zero
      - name: Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/python
            p/typescript
            p/owasp-top-ten

  # ── 1c. Dependency scanning ────────────────────────────────────────────────
  dep-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: pip-audit (Python deps)
        run: |
          pip install pip-audit
          pip-audit -r backend/requirements.txt --ignore-vuln GHSA-w235-7p84-xx57 || true
      - name: npm audit (frontend deps)
        run: |
          cd frontend
          npm ci
          npm audit --audit-level=high

  # ── 2. Build Docker images ─────────────────────────────────────────────────
  build:
    runs-on: ubuntu-latest
    needs: [secret-scan, sast, dep-scan]
    outputs:
      sha_tag: ${{ steps.meta.outputs.sha_tag }}
    steps:
      - uses: actions/checkout@v4

      - name: Set image tags
        id: meta
        run: echo "sha_tag=sha-${{ github.sha }}" >> $GITHUB_OUTPUT

      - name: Build API image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: false
          load: true
          tags: |
            ${{ env.API_IMAGE }}:latest
            ${{ env.API_IMAGE }}:${{ steps.meta.outputs.sha_tag }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build Frontend image
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          file: ./frontend/Dockerfile
          push: false
          load: true
          tags: |
            ${{ env.FRONTEND_IMAGE }}:latest
            ${{ env.FRONTEND_IMAGE }}:${{ steps.meta.outputs.sha_tag }}
          build-args: |
            VITE_CLERK_PUBLISHABLE_KEY=${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
            VITE_API_URL=/api
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Save images as artifacts
        run: |
          docker save ${{ env.API_IMAGE }}:latest | gzip > /tmp/api-image.tar.gz
          docker save ${{ env.FRONTEND_IMAGE }}:latest | gzip > /tmp/frontend-image.tar.gz

      - uses: actions/upload-artifact@v4
        with:
          name: docker-images
          path: /tmp/*.tar.gz
          retention-days: 1

  # ── 3. Container & IaC scanning (Trivy) ───────────────────────────────────
  container-scan:
    runs-on: ubuntu-latest
    needs: [build]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/download-artifact@v4
        with:
          name: docker-images
          path: /tmp/

      - name: Load images
        run: |
          docker load < /tmp/api-image.tar.gz
          docker load < /tmp/frontend-image.tar.gz

      - name: Trivy scan — API image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.API_IMAGE }}:latest
          format: table
          exit-code: 1
          severity: CRITICAL,HIGH
          ignore-unfixed: true

      - name: Trivy scan — Frontend image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.FRONTEND_IMAGE }}:latest
          format: table
          exit-code: 1
          severity: CRITICAL,HIGH
          ignore-unfixed: true

      - name: Trivy scan — compose.yml IaC
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: config
          scan-ref: compose.yml
          format: table
          exit-code: 0   # warn only for IaC misconfigs, don't block deploy

  # ── 4. Push to GHCR ────────────────────────────────────────────────────────
  push-to-ghcr:
    runs-on: ubuntu-latest
    needs: [container-scan]
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: docker-images
          path: /tmp/

      - name: Load images
        run: |
          docker load < /tmp/api-image.tar.gz
          docker load < /tmp/frontend-image.tar.gz

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Push API image
        run: |
          docker push ${{ env.API_IMAGE }}:latest
          docker tag ${{ env.API_IMAGE }}:latest ${{ env.API_IMAGE }}:sha-${{ github.sha }}
          docker push ${{ env.API_IMAGE }}:sha-${{ github.sha }}

      - name: Push Frontend image
        run: |
          docker push ${{ env.FRONTEND_IMAGE }}:latest
          docker tag ${{ env.FRONTEND_IMAGE }}:latest ${{ env.FRONTEND_IMAGE }}:sha-${{ github.sha }}
          docker push ${{ env.FRONTEND_IMAGE }}:sha-${{ github.sha }}

  # ── 5. Deploy ──────────────────────────────────────────────────────────────
  deploy:
    runs-on: ubuntu-latest
    needs: [push-to-ghcr]
    environment: production
    steps:
      - uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.DROPLET_SSH_KEY }}

      - name: Add droplet to known hosts
        run: ssh-keyscan -H ${{ secrets.DROPLET_HOST }} >> ~/.ssh/known_hosts

      - name: Deploy to droplet
        env:
          SHA_TAG: sha-${{ github.sha }}
        run: |
          ssh ${{ secrets.DROPLET_USER }}@${{ secrets.DROPLET_HOST }} \
            "IMAGE_TAG=$SHA_TAG bash ~/researchhub/scripts/deploy.sh"
```

**GitHub secrets required**:
- `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY` — SSH access
- `VITE_CLERK_PUBLISHABLE_KEY` — needed at Docker build time for frontend
- App secrets stay in `.env` on server only

---

## File 4: `scripts/deploy.sh` (runs on droplet)

Updated for GHCR pull-based deploy (no `--build`, images are pre-built):

```bash
#!/bin/bash
set -euo pipefail

REPO_DIR="$HOME/researchhub"
COMPOSE_CMD="docker compose -f compose.yml -f compose.prod.yml"
# IMAGE_TAG is set by GitHub Actions (e.g. sha-abc1234)
export IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "=== [$(date)] Deploy Starting (tag: $IMAGE_TAG) ==="
cd "$REPO_DIR"

# Pull latest code (for compose files, nginx config, scripts)
git pull origin main

# Login to GHCR on server (one-time setup, token stored in ~/.docker/config.json)
# echo "$GHCR_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin

# Pull pre-built images from GHCR
$COMPOSE_CMD pull api frontend

# Start all services (infrastructure services build locally if no image: override)
$COMPOSE_CMD up -d --remove-orphans

# Wait for postgres to be ready
timeout 60 bash -c 'until docker compose exec -T postgres pg_isready -U $POSTGRES_USER 2>/dev/null; do sleep 2; done'

# Run Alembic migrations (idempotent — no-op if already at head)
$COMPOSE_CMD exec -T api alembic upgrade head

echo "=== Deploy Complete (tag: $IMAGE_TAG) ==="
```

**Note**: Infrastructure services (postgres, opensearch, minio, airflow) have no `image:` override in compose.prod.yml pointing to GHCR, so they use their official Docker Hub images directly. Only `api` and `frontend` are built by CI and pulled from GHCR.

**GHCR login on server** (one-time setup):
```bash
echo "GITHUB_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```
Use a GitHub PAT with `read:packages` scope. This is done once on the droplet and credentials are stored in `~/.docker/config.json`.

---

## Migration Strategy

| System | How | When |
|---|---|---|
| **PostgreSQL** | `alembic upgrade head` in `scripts/deploy.sh` | Every deploy (idempotent) |
| **OpenSearch** | `setup_indices()` in API lifespan (`main.py:40`) | Every API container start (idempotent) |
| **MinIO** | `ensure_bucket()` in API lifespan (`main.py:52`) | Every API container start (idempotent) |
| **Airflow DB** | `airflow db migrate` in `entrypoint.sh` | Every Airflow container start |

No manual migration steps needed — all self-healing on startup.

---

## One-Time Server Setup (manual, done once via SSH)

```bash
# Install Docker
apt-get update && apt-get install -y docker.io docker-compose-plugin git
usermod -aG docker $USER && newgrp docker

# Required for OpenSearch
sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" >> /etc/sysctl.conf

# Clone and configure
git clone https://github.com/YOUR_ORG/researchhub.git ~/researchhub
cp ~/researchhub/.env.example ~/researchhub/.env
# Edit .env: set all production values (OPENAI_API_KEY, CLERK keys, strong POSTGRES_PASSWORD, etc.)

# Firewall
ufw allow 22/tcp && ufw allow 80/tcp && ufw enable
# Port 443 NOT needed — Cloudflare handles HTTPS externally

# First deploy
cd ~/researchhub
docker compose -f compose.yml -f compose.prod.yml up --build -d
```

## Cloudflare Setup

1. In Cloudflare DNS: `A` record → droplet IP, **Proxied** (orange cloud)
2. SSL/TLS → mode: **Flexible** (Cloudflare terminates HTTPS, sends HTTP to port 80)
3. Enable "Always Use HTTPS" under Edge Certificates

## OpenSearch Data Migration (702k papers) — Snapshot/Restore via scp

Transfer the existing indexed data from local machine to the droplet. Run after first deploy.

```bash
# ── Step 1: On local machine — register a filesystem snapshot repo ──
curl -X PUT "http://localhost:9200/_snapshot/local_backup" \
  -H "Content-Type: application/json" \
  -d '{"type":"fs","settings":{"location":"/tmp/os-snapshot","compress":true}}'

# ── Step 2: Create snapshot of arxiv-papers index ──
curl -X PUT "http://localhost:9200/_snapshot/local_backup/snap1?wait_for_completion=true" \
  -H "Content-Type: application/json" \
  -d '{"indices":"arxiv-papers,arxiv-papers-v2","include_global_state":false}'

# ── Step 3: Copy snapshot out of the container and compress ──
docker cp rag-opensearch:/tmp/os-snapshot ./os-snapshot-local
tar czf os-snapshot.tar.gz os-snapshot-local/

# ── Step 4: Transfer to droplet ──
scp os-snapshot.tar.gz user@DROPLET_IP:~/researchhub/

# ── Step 5: On droplet — copy into OpenSearch container ──
ssh user@DROPLET_IP
cd ~/researchhub
tar xzf os-snapshot.tar.gz
docker cp os-snapshot-local/. rag-opensearch:/tmp/os-snapshot/

# ── Step 6: Register repo and restore on droplet ──
curl -X PUT "http://localhost:9200/_snapshot/local_backup" \
  -H "Content-Type: application/json" \
  -d '{"type":"fs","settings":{"location":"/tmp/os-snapshot","compress":true}}'

curl -X POST "http://localhost:9200/_snapshot/local_backup/snap1/_restore?wait_for_completion=true" \
  -H "Content-Type: application/json" \
  -d '{"indices":"arxiv-papers,arxiv-papers-v2","include_global_state":false}'

# ── Step 7: Verify ──
curl http://localhost:9200/arxiv-papers/_count
```

Note: OpenSearch must be running on the droplet before step 5 (`docker compose -f compose.yml -f compose.prod.yml up -d opensearch`). The RRF pipeline (`hybrid-rrf-pipeline`) is recreated automatically by the API lifespan.

---

## Uptime Kuma (monitoring)

Add as a service in `compose.prod.yml` only (not in local `compose.yml`):

```yaml
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: researchhub-uptime
    volumes:
      - uptime_kuma_data:/app/data
    ports:
      - "3001:3001"   # accessible via SSH tunnel: ssh -L 3001:localhost:3001 user@droplet
    restart: unless-stopped
    networks:
      - rag-network
```

Add `uptime_kuma_data:` to the `volumes:` section in `compose.prod.yml`.

Configure monitors in the Uptime Kuma UI (via SSH tunnel on first setup):
- API health: `https://yourdomain.com/api/v1/health` — HTTP 200, every 60s
- Frontend: `https://yourdomain.com/` — HTTP 200, every 60s

Port 3001 is NOT opened in the firewall — access only via SSH tunnel.

---

## Verification

After deploy, verify:
```bash
# From local machine
curl https://yourdomain.com/api/v1/health        # API health
curl https://yourdomain.com/                      # Frontend loads

# On droplet
docker compose -f compose.yml -f compose.prod.yml ps   # All services healthy
docker compose logs api --tail 50                        # No errors
```
