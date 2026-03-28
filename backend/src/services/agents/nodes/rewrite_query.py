"""Rewrite query node — rewrites the query to improve retrieval."""

import json
import logging
import time

import openai

from src.config import get_settings
from src.services.agents.prompts import REWRITE_QUERY_PROMPT
from src.services.agents.state import AgentState

logger = logging.getLogger(__name__)
settings = get_settings()


def make_rewrite_query_node(trace):
    """Factory that returns a rewrite_query node with access to the Langfuse trace."""

    async def rewrite_query_node(state: AgentState) -> dict:
        span = trace.start_span(name="rewrite_query", input=state["query"])
        t0 = time.time()

        prompt = REWRITE_QUERY_PROMPT.format(
            research_goal=state.get("research_goal", ""),
            query=state["query"],
        )

        try:
            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=200,
                response_format={"type": "json_object"},
            )

            result = json.loads(response.choices[0].message.content)
            rewritten = result.get("rewritten_query", state["query"])

        except Exception:
            logger.exception("Rewrite query LLM call failed — keeping original query")
            rewritten = state["query"]

        latency = round((time.time() - t0) * 1000)
        span.update(output={"rewritten_query": rewritten, "latency_ms": latency})
        span.end()

        return {
            "rewritten_query": rewritten,
            "rewrite_count": state.get("rewrite_count", 0) + 1,
            "node_timings": {**state.get("node_timings", {}), "rewrite_query_ms": latency},
        }

    return rewrite_query_node
