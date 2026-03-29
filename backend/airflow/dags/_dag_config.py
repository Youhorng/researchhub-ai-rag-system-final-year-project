"""
Shared configuration for all Airflow DAGs.

All secrets come from environment variables injected by Docker Compose
via `env_file: .env`. Credentials use _require_env() so the DAG fails
fast with a clear error instead of silently falling back to test defaults.
"""

import os

from opensearchpy import OpenSearch


# ── Helpers ────────────────────────────────────────────────────────────
def _require_env(key: str) -> str:
    """Return the value of *key* or raise immediately if unset/empty."""
    val = os.environ.get(key)
    if not val:
        raise ValueError(
            f"Required environment variable '{key}' is not set. "
            f"Make sure it is defined in your .env file."
        )
    return val


# ── PostgreSQL ─────────────────────────────────────────────────────────
POSTGRES_USER = _require_env("POSTGRES_USER")
POSTGRES_PASSWORD = _require_env("POSTGRES_PASSWORD")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")
POSTGRES_DB = _require_env("POSTGRES_DB")

DATABASE_URL = (
    f"postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
)

# ── OpenSearch ─────────────────────────────────────────────────────────
OPENSEARCH_HOST = os.environ.get("OPENSEARCH__HOST", "http://opensearch:9200")
OPENSEARCH_INDEX_NAME = os.environ.get("OPENSEARCH__INDEX_NAME", "arxiv-papers")


def get_opensearch_client() -> OpenSearch:
    """Create an OpenSearch client.

    Security plugin is disabled in the Docker setup, so no auth is needed.
    """
    return OpenSearch(
        hosts=[OPENSEARCH_HOST],
        use_ssl=False,
        verify_certs=False,
        ssl_assert_hostname=False,
        ssl_show_warn=False,
    )


# ── OpenAI ─────────────────────────────────────────────────────────────
OPENAI_API_KEY = _require_env("OPENAI_API_KEY")
OPENAI_API_URL = "https://api.openai.com/v1"
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
OPENAI_EMBEDDING_DIMENSIONS = 1024
