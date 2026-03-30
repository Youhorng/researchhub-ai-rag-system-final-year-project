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
import time
import uuid
from collections.abc import AsyncGenerator

import openai
from opensearchpy import OpenSearch
from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.document import Document
from src.models.paper import ProjectPaper
from src.models.project import Project
from src.repositories import chat_repo
from src.services.agents.graph import build_retrieval_graph
from src.services.agents.nodes.hallucination_check import check_hallucination
from src.services.langfuse.tracer import create_rag_trace
from src.services.rag.prompts import (
    build_system_message,
    group_chunks_by_source,
    merge_duplicate_sources,
)

logger = logging.getLogger(__name__)
settings = get_settings()


def _sse(event_type: str, data: dict) -> str:
    """Return JSON payload for EventSourceResponse (it handles SSE framing)."""
    payload = {"type": event_type, **data}
    return json.dumps(payload)


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


def _collect_kb_titles(db: Session, project_id: uuid.UUID | None) -> list[str]:
    """Collect titles of all accepted papers and indexed documents for a project."""
    if not project_id:
        return []
    accepted_papers = (
        db.query(ProjectPaper)
        .filter(ProjectPaper.project_id == project_id, ProjectPaper.status == "accepted")
        .all()
    )
    titles = [pp.paper.title for pp in accepted_papers if pp.paper and pp.paper.title]
    uploaded_docs = (
        db.query(Document)
        .filter(Document.project_id == project_id, Document.chunks_indexed.is_(True))
        .all()
    )
    titles.extend(doc.title for doc in uploaded_docs if doc.title)
    return titles


def _build_cited_sources(grouped_sources: list[dict], full_response: str) -> tuple[list[dict], str]:
    """Build cited_sources list and renumber [N] markers to fill gaps."""
    cited_sources: list[dict] = []
    remap: dict[int, int] = {}
    for i, src in enumerate(grouped_sources, 1):
        if f"[{i}]" in full_response:
            new_idx = len(cited_sources) + 1
            remap[i] = new_idx
            cited_sources.append({
                "index": new_idx,
                "paper_id": src.get("paper_id"),
                "document_id": src.get("document_id"),
                "arxiv_id": src.get("arxiv_id"),
                "title": src.get("title"),
            })

    renumbered_text = full_response
    for old_idx in sorted(remap, reverse=True):
        renumbered_text = renumbered_text.replace(f"[{old_idx}]", f"[__CITE_{remap[old_idx]}__]")
    for new_idx in range(1, len(cited_sources) + 1):
        renumbered_text = renumbered_text.replace(f"[__CITE_{new_idx}__]", f"[{new_idx}]")

    return cited_sources, renumbered_text


async def _stream_openai(messages: list[dict], gen_span) -> tuple[str, int, int, int]:
    """Stream OpenAI chat completion and yield chunks; return full response + token counts."""
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

    chunks_yielded = []
    async for event in stream:
        if event.usage:
            input_tokens = event.usage.prompt_tokens
            output_tokens = event.usage.completion_tokens
        if not event.choices:
            continue
        delta = event.choices[0].delta
        if delta.content:
            full_response += delta.content
            chunks_yielded.append(_sse("chunk", {"content": delta.content}))

    gen_ms = round((time.time() - t0) * 1000)
    gen_span.update(
        output=full_response,
        usage_details={"input": input_tokens, "output": output_tokens},
        metadata={"latency_ms": gen_ms},
    )
    gen_span.end()
    return full_response, input_tokens, output_tokens, gen_ms, chunks_yielded


async def run_rag_pipeline(
    db: Session,
    os_client: OpenSearch,
    user_id: uuid.UUID,
    project: Project | None,
    session_id: uuid.UUID,
    user_query: str,
) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE events for a RAG chat turn."""

    project_id = project.id if project else None
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
            "project_id": str(project_id) if project_id else "",
            "research_goal": project.research_goal if project else "General scientific literature.",
            "initial_keywords": project.initial_keywords if project else [],
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

        # 5. Build system prompt from graded chunks
        chunks = result.get("graded_chunks", [])
        grouped_sources = group_chunks_by_source(chunks)
        grouped_sources = merge_duplicate_sources(grouped_sources)
        paper_titles = _collect_kb_titles(db, project_id)
        system_message = build_system_message(chunks, grouped_sources=grouped_sources, paper_titles=paper_titles)
        messages = _build_chat_messages(system_message, history, user_query)

        # 6. Stream generation
        gen_span = trace.start_generation(
            name="generate",
            model=settings.openai_chat_model,
            input=messages,
        )
        full_response, input_tokens, output_tokens, gen_ms, _ = await _stream_openai(messages, gen_span)

        # 7. Renumber citations before sending to frontend so text and panel indices match
        cited_sources, renumbered_text = _build_cited_sources(grouped_sources, full_response)

        # 8. Yield renumbered text + citations + done
        yield _sse("chunk", {"content": renumbered_text})
        if cited_sources:
            yield _sse("citations", {"sources": cited_sources})
        yield _sse("done", {})

        # 9. Run hallucination check (non-blocking, analytics only)
        hallucination_result = await check_hallucination(full_response, chunks, trace)

        # 10. Save assistant message with metadata
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
            "node_timings": result.get("node_timings", {}),
        }
        chat_repo.add_message(
            db, session_id, "assistant", renumbered_text, cited_sources, metadata
        )
        trace.update(output=full_response)
        trace.end()

    except Exception as e:
        logger.exception("RAG pipeline error")
        yield _sse("error", {"message": str(e)})
