"""Core RAG pipeline — async generator that yields SSE-formatted strings.

Flow:
1. Save user message to DB
2. Load last 10 messages (conversation context)
3. Embed user query via get_embeddings()           [Langfuse: embed span]
4. Hybrid search arxiv-papers-chunks by project_id  [Langfuse: retrieve span]
5. Build messages: [system + sources] + [history] + [user query]
6. Stream OpenAI response (AsyncOpenAI SDK)         [Langfuse: generation span]
7. Extract [N] citations from response text
8. Yield citations event + done event
9. Save assistant message with cited_sources + metadata to DB
"""

import json
import logging
import re
import time
import uuid
from collections.abc import AsyncGenerator

import openai
from opensearchpy import OpenSearch
from sqlalchemy.orm import Session
from src.config import get_settings
from src.repositories import chat_repo
from src.services.embeddings.openai import get_embeddings
from src.services.langfuse.tracer import create_rag_trace
from src.services.opensearch.query_builder import build_chunk_search_query
from src.services.rag.prompts import build_system_message

logger = logging.getLogger(__name__)
settings = get_settings()


def _sse(event_type: str, data: dict) -> str:
    """Format a single SSE event."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload)}\n\n"


def _source_key(chunk: dict) -> str:
    """Return a dedup key for a chunk — group by paper or document."""
    paper_id = chunk.get("paper_id", "")
    document_id = chunk.get("document_id", "")
    # Prefer paper_id, fall back to document_id
    return paper_id or document_id or ""


def _extract_citations(text: str, chunks: list[dict]) -> tuple[str, list[dict]]:
    """Extract [N] markers, group by paper/document, renumber sequentially."""
    original_indices = sorted(set(int(m) for m in re.findall(r"\[(\d+)\]", text)))

    # Step 1: Map each cited chunk index to a deduplicated source group.
    # Multiple chunk indices that belong to the same paper get the same new index.
    seen_sources: dict[str, int] = {}  # source_key → new_index
    sources: list[dict] = []
    remap: dict[int, int] = {}  # old chunk index → new source index

    for idx in original_indices:
        if not (1 <= idx <= len(chunks)):
            continue

        chunk = chunks[idx - 1]
        key = _source_key(chunk)

        if key and key in seen_sources:
            # This paper/document already has an index — reuse it
            remap[idx] = seen_sources[key]
        else:
            # New source
            new_idx = len(sources) + 1
            if key:
                seen_sources[key] = new_idx
            remap[idx] = new_idx
            sources.append({
                "index": new_idx,
                "paper_id": chunk.get("paper_id"),
                "document_id": chunk.get("document_id"),
                "arxiv_id": chunk.get("arxiv_id"),
                "title": chunk.get("title"),
            })

    # Step 2: Replace [old] → [new] in text (largest first to avoid partial matches)
    renumbered_text = text
    for old_idx in sorted(remap, reverse=True):
        renumbered_text = renumbered_text.replace(f"[{old_idx}]", f"[{remap[old_idx]}]")

    # Step 3: Collapse duplicate adjacent citations like "[1], [1]" → "[1]"
    renumbered_text = re.sub(r"(\[\d+\])(?:[,\s]*\1)+", r"\1", renumbered_text)

    return renumbered_text, sources


def _search_chunks(
    os_client: OpenSearch,
    query_text: str,
    query_vector: list[float],
    project_id: uuid.UUID,
    size: int = 8,
) -> list[dict]:
    """Execute hybrid search against the chunks index."""
    chunk_index = f"{settings.opensearch.index_name}-{settings.opensearch.chunk_index_suffix}"
    query = build_chunk_search_query(
        query_text=query_text,
        query_vector=query_vector,
        project_id=str(project_id),
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


def _build_chat_messages(
    system_message: str,
    history: list,
    user_query: str,
) -> list[dict]:
    """Build the messages array for the OpenAI chat completion."""
    messages = [{"role": "system", "content": system_message}]

    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": user_query})
    return messages


async def run_rag_pipeline(
    db: Session,
    os_client: OpenSearch,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    user_query: str,
) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE events for a RAG chat turn."""

    trace = create_rag_trace(user_id, session_id, project_id, user_query)

    try:
        # 1. Save user message
        chat_repo.add_message(db, session_id, "user", user_query)

        # 2. Load conversation history (last 10 messages, before the one we just saved)
        history = chat_repo.get_recent_messages(db, session_id, limit=10)
        # Exclude the user message we just saved (it's the last one)
        history = history[:-1] if history else []

        # 3. Embed query
        t0 = time.time()
        embed_span = trace.span(name="embed", input=user_query)
        vectors = get_embeddings([user_query])
        query_vector = vectors[0] if vectors else []
        embed_ms = round((time.time() - t0) * 1000)
        embed_span.end(
            output={"dimensions": len(query_vector), "latency_ms": embed_ms}
        )

        # 4. Retrieve chunks
        t0 = time.time()
        retrieve_span = trace.span(name="retrieve", input=user_query)
        chunks = _search_chunks(os_client, user_query, query_vector, project_id)
        retrieve_ms = round((time.time() - t0) * 1000)
        retrieve_span.end(
            output={
                "num_chunks": len(chunks),
                "latency_ms": retrieve_ms,
            }
        )

        # 5. Build messages
        system_message = build_system_message(chunks)
        messages = _build_chat_messages(system_message, history, user_query)

        # 6. Stream generation
        gen_span = trace.generation(
            name="generate",
            model=settings.openai_chat_model,
            input=messages,
        )

        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        t0 = time.time()
        full_response = ""
        input_tokens = 0
        output_tokens = 0

        stream = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=messages,
            temperature=0.3,
            max_tokens=2048,
            stream=True,
            stream_options={"include_usage": True},
        )

        async for event in stream:
            if event.usage:
                input_tokens = event.usage.prompt_tokens
                output_tokens = event.usage.completion_tokens

            if not event.choices:
                continue

            delta = event.choices[0].delta
            if delta.content:
                full_response += delta.content
                yield _sse("chunk", {"content": delta.content})

        gen_ms = round((time.time() - t0) * 1000)
        gen_span.end(
            output=full_response,
            usage={
                "input": input_tokens,
                "output": output_tokens,
            },
            metadata={"latency_ms": gen_ms},
        )

        # 7. Extract citations and renumber sequentially
        renumbered_text, cited_sources = _extract_citations(full_response, chunks)

        # 8. Yield citations + done
        if cited_sources:
            yield _sse("citations", {"sources": cited_sources})
        yield _sse("done", {})

        # 9. Save assistant message (with renumbered text)
        metadata = {
            "model": settings.openai_chat_model,
            "latency_ms": gen_ms,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "embed_ms": embed_ms,
            "retrieve_ms": retrieve_ms,
            "num_chunks": len(chunks),
        }
        chat_repo.add_message(
            db, session_id, "assistant", renumbered_text, cited_sources, metadata
        )

        # Update trace output
        trace.update(output=full_response)

    except Exception as e:
        logger.exception("RAG pipeline error")
        yield _sse("error", {"message": str(e)})
