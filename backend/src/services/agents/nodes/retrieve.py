"""Retrieve node — embeds query and searches OpenSearch for relevant chunks."""

import logging
import time

from opensearchpy import OpenSearch

from src.config import get_settings
from src.services.agents.state import AgentState
from src.services.embeddings.openai import get_embeddings
from src.services.opensearch.query_builder import build_chunk_search_query

logger = logging.getLogger(__name__)
settings = get_settings()


def _search_chunks(
    os_client: OpenSearch,
    query_text: str,
    query_vector: list[float],
    project_id: str,
    size: int = 8,
) -> list[dict]:
    """Execute hybrid search against the chunks index."""
    chunk_index = f"{settings.opensearch.index_name}-{settings.opensearch.chunk_index_suffix}"
    query = build_chunk_search_query(
        query_text=query_text,
        query_vector=query_vector,
        project_id=project_id,
        size=size,
    )

    try:
        response = os_client.search(
            index=chunk_index,
            body=query,
            params={"search_pipeline": settings.opensearch.rrf_pipeline_name},
        )
    except Exception:
        logger.exception("OpenSearch chunk search failed")
        return []

    chunks = []
    for hit in response.get("hits", {}).get("hits", []):
        source = hit["_source"]
        source["_score"] = hit.get("_score", 0.0)
        chunks.append(source)
    return chunks


def make_retrieve_node(os_client: OpenSearch, trace):
    """Factory that returns a retrieve node with access to OpenSearch client and trace."""

    async def retrieve_node(state: AgentState) -> dict:
        # Use rewritten query if available, otherwise original
        query_text = state.get("rewritten_query") or state["query"]

        # Embed
        t0 = time.time()
        embed_span = trace.start_span(name="embed", input=query_text)
        vectors = get_embeddings([query_text])
        query_vector = vectors[0] if vectors else []
        embed_ms = round((time.time() - t0) * 1000)
        embed_span.update(output={"dimensions": len(query_vector), "latency_ms": embed_ms})
        embed_span.end()

        # Retrieve
        t0 = time.time()
        retrieve_span = trace.start_span(name="retrieve", input=query_text)
        chunks = _search_chunks(os_client, query_text, query_vector, state["project_id"])
        retrieve_ms = round((time.time() - t0) * 1000)
        retrieve_span.update(output={"num_chunks": len(chunks), "latency_ms": retrieve_ms})
        retrieve_span.end()

        timings = {
            **state.get("node_timings", {}),
            "embed_ms": embed_ms,
            "retrieve_ms": retrieve_ms,
        }

        return {
            "query_vector": query_vector,
            "retrieved_chunks": chunks,
            "node_timings": timings,
        }

    return retrieve_node
