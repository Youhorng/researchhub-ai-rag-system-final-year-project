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
    project_id: str | None = None,
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


def _aggregate_project_sources(os_client: OpenSearch, chunk_index: str, project_id: str) -> set:
    """Return all (field, value) source tuples indexed for the given project."""
    agg_query = {
        "size": 0,
        "query": {"bool": {"filter": [{"term": {"project_id": project_id}}]}},
        "aggs": {
            "papers": {"terms": {"field": "paper_id", "size": 50}},
            "documents": {"terms": {"field": "document_id", "size": 50}},
        },
    }
    agg_resp = os_client.search(index=chunk_index, body=agg_query)
    all_sources: set = set()
    for bucket in agg_resp.get("aggregations", {}).get("papers", {}).get("buckets", []):
        if bucket["key"]:
            all_sources.add(("paper_id", bucket["key"]))
    for bucket in agg_resp.get("aggregations", {}).get("documents", {}).get("buckets", []):
        if bucket["key"]:
            all_sources.add(("document_id", bucket["key"]))
    return all_sources


def _fetch_extra_chunks(
    os_client: OpenSearch,
    chunk_index: str,
    missing: list,
    query_vector: list[float],
    project_id: str,
) -> list[dict]:
    """Fetch best-matching chunks for each missing source."""
    extra_chunks: list[dict] = []
    for field, source_id in missing:
        try:
            fill_query = {
                "size": 2,
                "query": {
                    "script_score": {
                        "query": {
                            "bool": {
                                "filter": [
                                    {"term": {"project_id": project_id}},
                                    {"term": {field: source_id}},
                                ]
                            }
                        },
                        "script": {
                            "source": "knn_score",
                            "lang": "knn",
                            "params": {
                                "field": "chunk_vector",
                                "query_value": query_vector,
                                "space_type": settings.opensearch.vector_space_type,
                            },
                        },
                    }
                },
            }
            resp = os_client.search(index=chunk_index, body=fill_query)
            for hit in resp.get("hits", {}).get("hits", []):
                src = hit["_source"]
                src["_score"] = hit.get("_score", 0.0)
                extra_chunks.append(src)
        except Exception:
            logger.warning("Failed to fill chunk for %s=%s", field, source_id)
    return extra_chunks


def _fill_missing_sources(
    os_client: OpenSearch,
    existing_chunks: list[dict],
    query_vector: list[float],
    project_id: str,
) -> list[dict]:
    """Ensure at least one chunk per paper/document in the project."""
    chunk_index = f"{settings.opensearch.index_name}-{settings.opensearch.chunk_index_suffix}"

    covered = {
        c.get("paper_id") or c.get("document_id") or ""
        for c in existing_chunks
        if c.get("paper_id") or c.get("document_id")
    }

    try:
        all_sources = _aggregate_project_sources(os_client, chunk_index, project_id)
    except Exception:
        logger.exception("Failed to aggregate sources for diversity fill")
        return existing_chunks

    missing = [(field, val) for field, val in all_sources if val not in covered]
    if not missing:
        return existing_chunks

    extra_chunks = _fetch_extra_chunks(os_client, chunk_index, missing, query_vector, project_id)
    return existing_chunks + extra_chunks


def make_retrieve_node(os_client: OpenSearch, trace):
    """Factory that returns a retrieve node with access to OpenSearch client and trace."""

    def retrieve_node(state: AgentState) -> dict:
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
        chunks = _search_chunks(os_client, query_text, query_vector, state.get("project_id"), size=15)

        # Ensure coverage across all papers/documents in the project
        if state.get("project_id"):
            chunks = _fill_missing_sources(os_client, chunks, query_vector, state["project_id"])

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
