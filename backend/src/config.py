from functools import lru_cache
from pydantic import BaseModel, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


# These are plain pydantic BaseModels (NOT BaseSettings).
# They are nested inside the main Settings class below.
# pydantic-settings maps double-underscore env vars to nested model fields:
#   LANGFUSE__HOST  →  settings.langfuse.host
#   REDIS__HOST     →  settings.redis.host
#   CHUNKING__CHUNK_SIZE → settings.chunking.chunk_size
# This is controlled by env_nested_delimiter="__" in the main Settings class.

class LangfuseSettings(BaseModel):
    enabled: bool = True
    host: str = "http://localhost:3001"
    public_key: str = ""   # maps to LANGFUSE__PUBLIC_KEY
    secret_key: str = ""   # maps to LANGFUSE__SECRET_KEY
    flush_at: int = 15
    flush_interval: float = 1.0
    debug: bool = False


class RedisSettings(BaseModel):
    host: str = "redis"      # maps to REDIS__HOST (Docker service name)
    port: int = 6379         # maps to REDIS__PORT
    password: str = ""       # maps to REDIS__PASSWORD
    db: int = 0              # maps to REDIS__DB
    ttl_hours: int = 6       # maps to REDIS__TTL_HOURS

    @computed_field
    @property
    def url(self) -> str:
        # Include password in URL only if set (Redis is optional in dev)
        if self.password:
            return f"redis://:{self.password}@{self.host}:{self.port}/{self.db}"
        return f"redis://{self.host}:{self.port}/{self.db}"


class ChunkingSettings(BaseModel):
    chunk_size: int = 600         # maps to CHUNKING__CHUNK_SIZE
    overlap_size: int = 100       # maps to CHUNKING__OVERLAP_SIZE
    min_chunk_size: int = 100     # maps to CHUNKING__MIN_CHUNK_SIZE
    section_based: bool = True    # maps to CHUNKING__SECTION_BASED


class OpenSearchSettings(BaseModel):
    # maps to OPENSEARCH__ vars — note that OPENSEARCH_HOST (single underscore)
    # is different from these. We use double-underscore for grouped settings.
    index_name: str = "arxiv-papers"          # OPENSEARCH__INDEX_NAME
    chunk_index_suffix: str = "chunks"        # OPENSEARCH__CHUNK_INDEX_SUFFIX
    vector_dimension: int = 1024              # OPENSEARCH__VECTOR_DIMENSION
    vector_space_type: str = "cosinesimil"    # OPENSEARCH__VECTOR_SPACE_TYPE
    rrf_pipeline_name: str = "hybrid-rrf-pipeline"  # OPENSEARCH__RRF_PIPELINE_NAME
    hybrid_search_size_multiplier: int = 2    # OPENSEARCH__HYBRID_SEARCH_SIZE_MULTIPLIER


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",   # LANGFUSE__HOST → langfuse.host
        case_sensitive=False,
        extra="ignore",              # silently ignore unknown env vars
    )

    # App
    debug: bool = False
    environment: str = "development"    # ENVIRONMENT=development|production
    app_name: str = "ResearchHub API"

    # Accept the full pre-built URL directly (preferred in Docker).
    # This maps to POSTGRES_DATABASE_URL in your .env.
    postgres_database_url: str = ""

    # Individual parts — used only if postgres_database_url is NOT set.
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_user: str = "rag_user"
    postgres_password: str = "rag_password"
    postgres_db: str = "rag_db"

    @computed_field
    @property
    def database_url(self) -> str:
        # If POSTGRES_DATABASE_URL is set in .env (e.g. in Docker), use it directly.
        # Otherwise, build it from individual parts (useful for bare-metal dev).
        if self.postgres_database_url:
            return self.postgres_database_url
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    clerk_secret_key: str = ""         # CLERK_SECRET_KEY
    clerk_publishable_key: str = ""    # CLERK_PUBLISHABLE_KEY
    clerk_jwks_url: str = ""           # CLERK_JWKS_URL

    # OLLAMA_HOST uses single underscore — flat var, not nested.
    ollama_host: str = "http://ollama:11434"   # maps to OLLAMA_HOST
    ollama_model: str = "llama3.2:1b"          # maps to OLLAMA_MODEL
    ollama_timeout: int = 300                  # maps to OLLAMA_TIMEOUT (seconds)

    jina_api_key: str = ""
    jina_embedding_model: str = "jina-embeddings-v3"
    jina_embedding_dimensions: int = 1024

    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "researchhub-documents"
    minio_secure: bool = False    # True in production (HTTPS)

    # OPENSEARCH_HOST (single underscore) is the Docker service base URL.
    # Grouped settings (index names, dimensions, etc.) use double underscore
    # and are captured in the nested OpenSearchSettings model below.
    opensearch_host: str = "http://opensearch:9200"   # maps to OPENSEARCH_HOST
    opensearch_user: str = "admin"
    opensearch_password: str = "admin"

    # pydantic-settings 
    langfuse: LangfuseSettings = LangfuseSettings()
    redis: RedisSettings = RedisSettings()
    chunking: ChunkingSettings = ChunkingSettings()
    opensearch: OpenSearchSettings = OpenSearchSettings()


@lru_cache
def get_settings() -> Settings:
    return Settings()
