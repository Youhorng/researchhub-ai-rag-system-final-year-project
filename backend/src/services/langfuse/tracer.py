"""Langfuse tracing wrapper with graceful degradation.

All calls are wrapped in try/except — a Langfuse outage never breaks chat.
When Langfuse is disabled or unreachable, no-op stubs are returned instead.
"""

import logging
import uuid

from src.config import get_settings

logger = logging.getLogger(__name__)

# Module-level singleton — lazy-initialized on first call
_client = None
_init_attempted = False


def _get_client():
    global _client, _init_attempted
    if _init_attempted:
        return _client
    _init_attempted = True

    settings = get_settings()
    if not settings.langfuse.enabled:
        logger.info("Langfuse tracing disabled via config")
        return None

    try:
        from langfuse import Langfuse

        # SDK auto-reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY,
        # and LANGFUSE_BASE_URL from environment variables.
        _client = Langfuse(
            flush_at=settings.langfuse.flush_at,
            flush_interval=settings.langfuse.flush_interval,
            debug=settings.langfuse.debug,
        )
        logger.info("Langfuse client initialized")
    except Exception:
        logger.exception("Failed to initialize Langfuse — tracing disabled")
        _client = None

    return _client


class _NoOpSpan:
    """Stub span that silently ignores all calls."""

    def end(self, **kwargs):
        # Intentional no-op — tracing is disabled
        pass

    def update(self, **kwargs):
        return self

    def start_span(self, **kwargs):
        return _NoOpSpan()

    def start_generation(self, **kwargs):
        return _NoOpSpan()

    def update_trace(self, **kwargs):
        # Intentional no-op — tracing is disabled
        pass


def create_rag_trace(
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    project_id: uuid.UUID,
    user_query: str,
):
    """Create a Langfuse root span for a RAG pipeline run.

    Returns a real Langfuse span if available, otherwise a no-op stub.
    """
    client = _get_client()
    if client is None:
        return _NoOpSpan()

    try:
        span = client.start_span(
            name="rag-chat",
            input=user_query,
            metadata={
                "user_id": str(user_id),
                "session_id": str(session_id),
                "project_id": str(project_id),
            },
        )
        return span
    except Exception:
        logger.exception("Failed to create Langfuse trace")
        return _NoOpSpan()
