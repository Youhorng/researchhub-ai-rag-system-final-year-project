import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from src.config import get_settings
from src.database import check_db_connection, engine
from src.exceptions import exception_handlers
from src.middlewares import setup_middlewares
from src.routers.auth import router as auth_router
from src.routers.health import router as health_router
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
