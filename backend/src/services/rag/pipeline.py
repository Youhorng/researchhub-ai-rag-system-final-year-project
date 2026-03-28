"""Core RAG pipeline — async generator that yields SSE-formatted strings.

Flow:
1. Save user message to DB
2. Load last 10 messages (conversation context)
3. Run LangGraph agent (guardrail → retrieve → grade → rewrite loop)
4. If guardrail rejects → yield rejection SSE → return
5. Build messages: [system + sources] + [history] + [user query]
6. Stream OpenAI response (AsyncOpenAI SDK)         [Langfuse: generation span]
7. Extract [N] citations from response text
8. Yield citations event + done event
9. Run hallucination check (non-blocking, analytics only)
10. Save assistant message with cited_sources + metadata to DB
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
from src.models.project import Project
from src.repositories import chat_repo
from src.services.agents.graph import build_retrieval_graph
from src.services.agents.nodes.hallucination_check import check_hallucination
from src.services.langfuse.tracer import create_rag_trace
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
    return paper_id or document_id or ""


def _extract_citations(text: str, chunks: list[dict]) -> tuple[str, list[dict]]:
    """Extract [N] markers, group by paper/document, renumber sequentially."""
    original_indices = sorted(set(int(m) for m in re.findall(r"\[(\d+)\]", text)))

    seen_sources: dict[str, int] = {}
    sources: list[dict] = []
    remap: dict[int, int] = {}

    for idx in original_indices:
        if not (1 <= idx <= len(chunks)):
            continue

        chunk = chunks[idx - 1]
        key = _source_key(chunk)

        if key and key in seen_sources:
            remap[idx] = seen_sources[key]
        else:
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

    renumbered_text = text
    for old_idx in sorted(remap, reverse=True):
        renumbered_text = renumbered_text.replace(f"[{old_idx}]", f"[{remap[old_idx]}]")

    renumbered_text = re.sub(r"(\[\d+\])(?:[,\s]*\1)+", r"\1", renumbered_text)

    return renumbered_text, sources


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
    project: Project,
    session_id: uuid.UUID,
    user_query: str,
) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE events for a RAG chat turn."""

    project_id = project.id
    trace = create_rag_trace(user_id, session_id, project_id, user_query)

    try:
        # 1. Save user message
        chat_repo.add_message(db, session_id, "user", user_query)

        # 2. Load conversation history (last 10 messages, before the one we just saved)
        history = chat_repo.get_recent_messages(db, session_id, limit=10)
        history = history[:-1] if history else []

        # 3. Run LangGraph agent (guardrail → retrieve → grade → rewrite)
        graph = build_retrieval_graph(os_client, trace)

        agent_state = {
            "query": user_query,
            "project_id": str(project_id),
            "research_goal": project.research_goal or "",
            "initial_keywords": project.initial_keywords or [],
            "conversation_history": [
                {"role": msg.role, "content": msg.content} for msg in history
            ],
            "rewrite_count": 0,
            "node_timings": {},
        }

        result = await graph.ainvoke(agent_state)

        # 4. If guardrail rejected → yield rejection and return
        if not result.get("is_in_scope", True):
            rejection = result.get("rejection_message", "This question is outside the scope of your research project.")
            yield _sse("chunk", {"content": rejection})
            yield _sse("done", {})
            chat_repo.add_message(
                db, session_id, "assistant", rejection, [],
                {"guardrail_rejected": True, "node_timings": result.get("node_timings", {})},
            )
            trace.update(output=rejection)
            trace.end()
            return

        # 5. Use graded chunks from the graph for generation
        chunks = result.get("graded_chunks", [])

        system_message = build_system_message(chunks)
        messages = _build_chat_messages(system_message, history, user_query)

        # 6. Stream generation
        gen_span = trace.start_generation(
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
        gen_span.update(
            output=full_response,
            usage_details={
                "input": input_tokens,
                "output": output_tokens,
            },
            metadata={"latency_ms": gen_ms},
        )
        gen_span.end()

        # 7. Extract citations and renumber sequentially
        renumbered_text, cited_sources = _extract_citations(full_response, chunks)

        # 8. Yield citations + done
        if cited_sources:
            yield _sse("citations", {"sources": cited_sources})
        yield _sse("done", {})

        # 9. Run hallucination check (non-blocking, analytics only)
        hallucination_result = await check_hallucination(full_response, chunks, trace)

        # 10. Save assistant message with metadata
        node_timings = result.get("node_timings", {})
        metadata = {
            "model": settings.openai_chat_model,
            "latency_ms": gen_ms,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "num_chunks_retrieved": len(result.get("retrieved_chunks", [])),
            "num_chunks_graded": len(chunks),
            "rewrite_count": result.get("rewrite_count", 0),
            "rewritten_query": result.get("rewritten_query", ""),
            "hallucination_check": hallucination_result,
            "node_timings": node_timings,
        }
        chat_repo.add_message(
            db, session_id, "assistant", renumbered_text, cited_sources, metadata
        )

        trace.update(output=full_response)
        trace.end()

    except Exception as e:
        logger.exception("RAG pipeline error")
        yield _sse("error", {"message": str(e)})
