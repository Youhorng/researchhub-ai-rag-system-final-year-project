"""Guardrail node — checks if the user query is on-topic for the project."""

import json
import logging
import time

import openai

from src.config import get_settings
from src.services.agents.prompts import GUARDRAIL_PROMPT
from src.services.agents.state import AgentState

logger = logging.getLogger(__name__)
settings = get_settings()


def make_guardrail_node(trace):
    """Factory that returns a guardrail node with access to the Langfuse trace."""

    async def guardrail_node(state: AgentState) -> dict:
        span = trace.start_span(name="guardrail", input=state["query"])
        t0 = time.time()

        research_goal = state.get("research_goal", "")
        keywords = ", ".join(state.get("initial_keywords", []))

        # If no research goal is set, skip guardrail (allow everything)
        if not research_goal:
            latency = round((time.time() - t0) * 1000)
            span.update(output={"is_in_scope": True, "reason": "no research goal set"})
            span.end()
            return {
                "is_in_scope": True,
                "rejection_message": "",
                "node_timings": {**state.get("node_timings", {}), "guardrail_ms": latency},
            }

        prompt = GUARDRAIL_PROMPT.format(
            research_goal=research_goal,
            keywords=keywords,
            query=state["query"],
        )

        try:
            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=150,
                response_format={"type": "json_object"},
            )

            result = json.loads(response.choices[0].message.content)
            is_in_scope = result.get("is_in_scope", True)
            reason = result.get("reason", "")

        except Exception:
            logger.exception("Guardrail LLM call failed — defaulting to in-scope")
            is_in_scope = True
            reason = "guardrail error, defaulting to allow"

        latency = round((time.time() - t0) * 1000)
        span.update(output={"is_in_scope": is_in_scope, "reason": reason})
        span.end()

        rejection_message = ""
        if not is_in_scope:
            rejection_message = (
                f"This question doesn't seem related to your research project. "
                f"Reason: {reason}. Please ask something relevant to your research goal."
            )

        return {
            "is_in_scope": is_in_scope,
            "rejection_message": rejection_message,
            "node_timings": {**state.get("node_timings", {}), "guardrail_ms": latency},
        }

    return guardrail_node
