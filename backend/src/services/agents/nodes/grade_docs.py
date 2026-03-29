"""Grade documents node — filters retrieved chunks by relevance to the query."""

import json
import logging
import time

import openai

from src.config import get_settings
from src.services.agents.prompts import GRADE_DOCUMENT_PROMPT
from src.services.agents.state import AgentState

logger = logging.getLogger(__name__)
settings = get_settings()


def _parse_grade_response(raw: object) -> list:
    """Parse the LLM grading response into a list of grade objects."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return raw.get("results") or raw.get("grades") or raw.get("chunks") or []
    return []


def _filter_relevant_chunks(grades: list, chunks: list) -> list:
    """Return chunks whose grade entry marks them as relevant."""
    graded_chunks = []
    for grade in grades:
        idx = grade.get("index", -1)
        if grade.get("relevant", False) and 0 <= idx < len(chunks):
            graded_chunks.append(chunks[idx])
    if not graded_chunks and chunks:
        logger.warning("Grade docs returned no relevant chunks — keeping all")
        return chunks
    return graded_chunks


def make_grade_docs_node(trace):
    """Factory that returns a grade_docs node with access to the Langfuse trace."""

    async def grade_docs_node(state: AgentState) -> dict:
        span = trace.start_span(name="grade_docs", input=state["query"])
        t0 = time.time()
        chunks = state.get("retrieved_chunks", [])

        if not chunks:
            latency = round((time.time() - t0) * 1000)
            span.update(output={"graded": 0, "relevant": 0})
            span.end()
            return {
                "graded_chunks": [],
                "node_timings": {**state.get("node_timings", {}), "grade_docs_ms": latency},
            }

        chunks_text = "\n\n".join(
            f"[Chunk {i}] {chunk.get('title', 'Untitled')}\n{chunk.get('chunk_text', '')}"
            for i, chunk in enumerate(chunks)
        )
        prompt = GRADE_DOCUMENT_PROMPT.format(query=state["query"], chunks_text=chunks_text)

        try:
            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=500,
                response_format={"type": "json_object"},
            )
            raw = json.loads(response.choices[0].message.content)
            grades = _parse_grade_response(raw)
            graded_chunks = _filter_relevant_chunks(grades, chunks)
        except Exception:
            logger.exception("Grade docs LLM call failed — keeping all chunks")
            graded_chunks = chunks

        latency = round((time.time() - t0) * 1000)
        span.update(output={"graded": len(chunks), "relevant": len(graded_chunks)})
        span.end()

        return {
            "graded_chunks": graded_chunks,
            "node_timings": {**state.get("node_timings", {}), "grade_docs_ms": latency},
        }

    return grade_docs_node
