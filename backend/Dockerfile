# Setup the Multi-stage build for the backend to use a builder stage to install 
# dependencies and a runner stage for the final image

# --- Stage 1: Builder (Install Dependencies) ---
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Copy dependency files first (for better caching)
COPY pyproject.toml uv.lock ./

# Install dependencies into a virtual environment
# --frozen: strict sync from uv.lock
# --no-dev: production dependencies only 
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=/app/uv.lock \
    --mount=type=bind,source=pyproject.toml,target=/app/pyproject.toml \
    uv sync --frozen --no-dev

# --- Stage 2: Runner (Final Image) ---
FROM python:3.12.8-slim AS runner

WORKDIR /app

# Copy the virtual environment from the builder stage
COPY --from=builder /app/.venv /app/.venv

# Add venv to PATH so we do not need to activate
ENV PATH="/app/.venv/bin:$PATH"

# Copy the source code
COPY src ./src

# PYTHONUNBUFFERED=1 to disable output buffering
ENV PYTHONUNBUFFERED=1
ARG VERSION=0.1.0
ENV APP_VERSION=$VERSION

# Expose the port 
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"] 