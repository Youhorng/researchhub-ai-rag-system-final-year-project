from functools import lru_cache

from pydantic import BaseModel, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class LangfuseSettings(BaseModel):
    enabled: bool = True
    flush_at: int = 15
    flush_interval: float = 1.0
    debug: bool = False


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
    environment: str = "development"
    app_name: str = "ResearchHub API"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

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

    # SonarCloud
    sonarcloud_token: str = ""
    sonarcloud_org: str = ""
    sonarcloud_project: str = ""
    sonarcloud_base_url: str = ""

    # OpenAI Model
    openai_chat_model: str = "gpt-4o-mini"
    openai_api_url: str = "https://api.openai.com/v1/embeddings"
    openai_chat_url: str = "https://api.openai.com/v1/chat/completions"

    openai_api_key: str = ""
    openai_embedding_model: str = "text-embedding-3-small"
    openai_embedding_dimensions: int = 1024

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
    chunking: ChunkingSettings = ChunkingSettings()
    opensearch: OpenSearchSettings = OpenSearchSettings()


@lru_cache
def get_settings() -> Settings:
    return Settings()
