"""Hallucination check — post-generation check for answer groundedness."""

import json
import logging
import time

import openai

from src.config import get_settings
from src.services.agents.prompts import HALLUCINATION_CHECK_PROMPT

logger = logging.getLogger(__name__)
settings = get_settings()


async def check_hallucination(
    answer: str,
    chunks: list[dict],
    trace,
) -> dict:
    """Check if the generated answer is grounded in the source chunks.

    Called after streaming completes. Result stored in message metadata.
    Returns: {"is_grounded": bool, "score": float, "reason": str}
    """
    span = trace.start_span(name="hallucination_check", input=answer[:200])
    t0 = time.time()

    if not answer or not chunks:
        span.update(output={"skipped": True})
        span.end()
        return {"is_grounded": True, "score": 1.0, "reason": "no content to check"}

    # Build chunks text
    chunks_text_parts = []
    for i, chunk in enumerate(chunks):
        title = chunk.get("title", "Untitled")
        text = chunk.get("chunk_text", "")
        chunks_text_parts.append(f"[{i + 1}] {title}\n{text}")
    chunks_text = "\n\n".join(chunks_text_parts)

    prompt = HALLUCINATION_CHECK_PROMPT.format(
        answer=answer,
        chunks_text=chunks_text,
    )

    try:
        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=200,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        is_grounded = result.get("is_grounded", True)
        score = float(result.get("score", 1.0))
        reason = result.get("reason", "")

    except Exception:
        logger.exception("Hallucination check failed")
        is_grounded = True
        score = 1.0
        reason = "check failed, defaulting to grounded"

    latency = round((time.time() - t0) * 1000)
    output = {"is_grounded": is_grounded, "score": score, "reason": reason}
    span.update(output={**output, "latency_ms": latency})
    span.end()

    return output
