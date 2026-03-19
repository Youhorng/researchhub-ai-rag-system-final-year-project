import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from src.config import get_settings
from src.database import check_db_connection, engine
from src.exceptions import exception_handlers
from src.middlewares import setup_middlewares
from src.routers.auth import router as auth_router
from src.routers.chat import router as chat_router
from src.routers.documents import router as documents_router
from src.routers.health import router as health_router
from src.routers.papers import router as papers_router
from src.routers.projects import router as projects_router

# Configure settings and logging
settings = get_settings()
logger = logging.getLogger(__name__)

# Define the context manager for the application
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s [%s]", settings.app_name, settings.environment)
    db_ok = check_db_connection()
    if db_ok:
        logger.info("PostgreSQL connected ✓")
    else:
        logger.error("PostgreSQL connection FAILED — check DB config")

    # Ensure OpenSearch indices and pipelines exist (idempotent)
    try:
        from src.services.opensearch.client import get_opensearch_client
        from src.services.opensearch.index_config import setup_indices

        os_client = get_opensearch_client()
        setup_indices(os_client)
        os_client.close()
        logger.info("OpenSearch indices ready ✓")
    except Exception:
        logger.exception("OpenSearch index setup failed — search may not work")

    # Ensure MinIO bucket exists
    try:
        from src.services.storage.minio_client import ensure_bucket, get_minio_client

        minio = get_minio_client()
        ensure_bucket(minio)
        logger.info("MinIO bucket ready ✓")
    except Exception:
        logger.exception("MinIO bucket setup failed — document upload may not work")

    yield
    logger.info("Shutting down %s", settings.app_name)
    engine.dispose()
    logger.info("PostgreSQL connection closed ✗")


# Create the FastAPI app
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)


# Setup the middlewares
setup_middlewares(app)

# Add exception handlers
for exc_class, handler in exception_handlers:
    app.add_exception_handler(exc_class, handler)

# Mount router
app.include_router(auth_router)
app.include_router(health_router)
app.include_router(projects_router)
app.include_router(papers_router)
app.include_router(documents_router)
app.include_router(chat_router)