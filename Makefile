.PHONY: help start stop restart status logs health setup format lint test test-cov clean

# Default target
help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ─── Service Management ──────────────────────────────────────────────────────

start: ## Start all services (builds images if needed)
	docker compose up --build -d

stop: ## Stop all services (keeps volumes/data)
	docker compose down

restart: ## Restart all services (re-reads .env)
	docker compose up -d

status: ## Show service status and ports
	docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

logs: ## Stream logs for all services (Ctrl+C to stop)
	docker compose logs -f

logs-api: ## Stream logs for API only
	docker compose logs -f api

logs-airflow: ## Stream logs for Airflow only
	docker compose logs -f airflow

# ─── Health Checks ───────────────────────────────────────────────────────────

health: ## Quick health check of key services
	@echo "=== ResearchHub Health Check ==="
	@echo -n "API:                "; curl -sf http://localhost:8000/api/v1/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅', d.get('status','?'))" 2>/dev/null || echo "❌ not responding"
	@echo -n "OpenSearch:         "; curl -sf "http://localhost:9200/_cluster/health" | python3 -c "import sys,json; d=json.load(sys.stdin); s=d.get('status','?'); print(('✅' if s in ('green','yellow') else '❌'), s)" 2>/dev/null || echo "❌ not responding"
	@echo -n "Airflow:            "; curl -sf http://localhost:8080/health | python3 -c "import sys,json; d=json.load(sys.stdin); s=d.get('scheduler',{}).get('status','?'); print('✅' if s=='healthy' else '❌', 'scheduler:', s)" 2>/dev/null || echo "❌ not responding"
	@echo -n "Ollama:             "; curl -sf http://localhost:11434/api/tags | python3 -c "import sys,json; d=json.load(sys.stdin); m=[x['name'] for x in d.get('models',[])]; print('✅ models:', ', '.join(m) if m else 'none pulled')" 2>/dev/null || echo "❌ not responding"
	@echo -n "Langfuse:           "; curl -sf http://localhost:3001/api/public/health | python3 -c "import sys,json; print('✅ healthy')" 2>/dev/null || echo "❌ not responding"

# ─── Development ─────────────────────────────────────────────────────────────

setup: ## Install Python dependencies (run from backend/)
	uv sync

format: ## Format code with ruff
	uv run ruff format src/

lint: ## Lint and type check
	uv run ruff check --fix src/
	uv run mypy src/

test: ## Run tests
	uv run pytest

test-cov: ## Run tests with HTML coverage report
	uv run pytest --cov=src --cov-report=html
	@echo "Coverage report: backend/htmlcov/index.html"

# ─── Cleanup ─────────────────────────────────────────────────────────────────

clean: ## ⚠️  Stop services and delete ALL data (volumes included)
	@echo "⚠️  This will DELETE all database data, OpenSearch indices, and Ollama models."
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose down -v
	docker system prune -f