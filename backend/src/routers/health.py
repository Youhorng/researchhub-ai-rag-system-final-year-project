import logging
from fastapi import APIRouter
from src.database import check_db_connection


# Configure logging
logger = logging.getLogger(__name__)

# Define the router
router = APIRouter(prefix="/api/v1", tags=["health"])


# GET request for health
@router.get("/health")
async def health_check() -> dict:
    """
    Returns the health status of the API and its dependencies.
    No authentication required.
    """
    db_ok = check_db_connection()
    status = "ok" if db_ok else "degraded"
    logger.info("GET /health — status: %s", status)
    return {
        "status": status,
        "db": db_ok,
    }
