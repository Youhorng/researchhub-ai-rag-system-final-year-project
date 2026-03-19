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

    if not settings.langfuse.public_key or not settings.langfuse.secret_key:
        logger.warning("Langfuse keys not set — tracing disabled")
        return None

    try:
        from langfuse import Langfuse

        _client = Langfuse(
            public_key=settings.langfuse.public_key,
            secret_key=settings.langfuse.secret_key,
            host=settings.langfuse.host,
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
        pass

    def update(self, **kwargs):
        pass

    def span(self, **kwargs):
        return _NoOpSpan()

    def generation(self, **kwargs):
        return _NoOpSpan()


class _NoOpTrace:
    """Stub trace that silently ignores all calls."""

    id = "noop"

    def span(self, **kwargs):
        return _NoOpSpan()

    def generation(self, **kwargs):
        return _NoOpSpan()

    def update(self, **kwargs):
        pass


def create_rag_trace(
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    project_id: uuid.UUID,
    user_query: str,
):
    """Create a Langfuse trace for a RAG pipeline run.

    Returns a real Langfuse trace if available, otherwise a no-op stub.
    """
    client = _get_client()
    if client is None:
        return _NoOpTrace()

    try:
        trace = client.trace(
            name="rag-chat",
            user_id=str(user_id),
            session_id=str(session_id),
            metadata={
                "project_id": str(project_id),
            },
            input=user_query,
        )
        return trace
    except Exception:
        logger.exception("Failed to create Langfuse trace")
        return _NoOpTrace()
