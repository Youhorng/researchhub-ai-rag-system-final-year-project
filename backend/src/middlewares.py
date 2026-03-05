import logging 
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from src.config import get_settings


# Get the config settings
settings = get_settings()

# Configure logging
logger = logging.getLogger(__name__)


# Add CORS middleware
def add_cors_middleware(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# Async function to log the middleware request
async def logging_middleware(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start_time) * 1000
    logger.info(
        f"{request.method} {request.url.path} "
        f"→ {response.status_code} "
        f"({duration_ms:.1f}ms)"
    )
    return response


# Setup the middleware
def setup_middlewares(app: FastAPI) -> None:
    add_cors_middleware(app)
    app.middleware("http")(logging_middleware)