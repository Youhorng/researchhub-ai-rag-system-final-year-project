# deploy.sh — runs on the DigitalOcean droplet via SSH from GitHub Actions
#
# Called by GitHub Actions deploy job:
#   ssh user@droplet "IMAGE_TAG=$SHA_TAG bash ~/researchhub/scripts/deploy.sh"
#
# What it does:
#   1. Save current running tag (for rollback if anything fails)
#   2. Pull latest code (compose files, nginx config, scripts, DAGs)
#   3. Pull pre-built api + frontend + airflow images from GHCR
#   4. Start/restart only changed containers
#   5. Run Alembic migrations (idempotent — no-op if already at head)
#   6. Clean up old Docker images to free disk space

set -euo pipefail

REPO_DIR="$HOME/researchhub"
COMPOSE_CMD="docker compose -f $REPO_DIR/compose.prod.yml"

# IMAGE_TAG is passed in by GitHub Actions (example: sha-abc1234)
# Falls back to latest if run manually without setting IMAGE_TAG
export IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "=== [$(date)] Deploy starting (tag: $IMAGE_TAG) ==="

cd "$REPO_DIR"

# ---------------------------------------------------------------------------
# Step 1: Save current running tag for rollback
# Reads the image tag from the currently running api container
# Stored in a file so rollback() can restore it even after git pull changes things
# ---------------------------------------------------------------------------
ROLLBACK_TAG=$(docker inspect researchhub-api --format='{{index .Config.Image}}' 2>/dev/null | cut -d: -f2 || echo "latest")
echo "--- Current running tag: $ROLLBACK_TAG ---"

rollback() {
    echo "!!! Deploy failed — rolling back to $ROLLBACK_TAG !!!"
    export IMAGE_TAG="$ROLLBACK_TAG"
    $COMPOSE_CMD pull api frontend airflow
    $COMPOSE_CMD up -d --remove-orphans
    echo "!!! Rollback complete — running tag: $ROLLBACK_TAG !!!"
    exit 1
}

# Trigger rollback on any error from this point forward
trap rollback ERR

# ---------------------------------------------------------------------------
# Step 2: Pull latest code
# Updates compose.prod.yml, nginx/nginx.conf, scripts/, backend/airflow/dags/
# and backend/src/ (used by Airflow via volume mount)
# ---------------------------------------------------------------------------
echo "--- Pulling latest code from main ---"
git pull origin main

# ---------------------------------------------------------------------------
# Step 3: Pull pre-built images from GHCR
# Only pulls api, frontend, airflow — infrastructure images (postgres, opensearch,
# minio) use official Docker Hub images and are not managed by CI
# ---------------------------------------------------------------------------
echo "--- Pulling images from GHCR (tag: $IMAGE_TAG) ---"
$COMPOSE_CMD pull api frontend airflow

# ---------------------------------------------------------------------------
# Step 4: Start all services
# --remove-orphans cleans up any containers no longer defined in compose file
# Only containers whose image or config changed will restart — others stay up
# ---------------------------------------------------------------------------
echo "--- Starting services ---"
$COMPOSE_CMD up -d --remove-orphans

# ---------------------------------------------------------------------------
# Step 5: Wait for PostgreSQL to be ready before running migrations
# ---------------------------------------------------------------------------
echo "--- Waiting for PostgreSQL ---"
timeout 60 bash -c "until $COMPOSE_CMD exec -T postgres pg_isready -U \${POSTGRES_USER} 2>/dev/null; do sleep 2; done"

# ---------------------------------------------------------------------------
# Step 6: Run Alembic migrations
# Idempotent — no-op if database is already at the latest revision
# ---------------------------------------------------------------------------
echo "--- Running Alembic migrations ---"
$COMPOSE_CMD exec -T api alembic upgrade head

# ---------------------------------------------------------------------------
# Step 7: Clean up dangling images to free disk space
# Old images accumulate on every deploy — this keeps the droplet disk clean
# ---------------------------------------------------------------------------
echo "--- Cleaning up old images ---"
docker image prune -f

# Disable the error trap — deploy succeeded, no rollback needed
trap - ERR

echo "=== [$(date)] Deploy complete (tag: $IMAGE_TAG) ==="