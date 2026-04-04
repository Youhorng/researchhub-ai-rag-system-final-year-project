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
        span = trace.start_observation(name="guardrail", as_type="guardrail", input=state["query"])
        t0 = time.time()

        research_goal = state.get("research_goal", "")
        keywords = ", ".join(state.get("initial_keywords", []))

        # If no research goal is set, skip guardrail (allow everything)
        if not research_goal:
            latency = round((time.time() - t0) * 1000)
            span.update(output={"is_in_scope": True, "query_type": "research", "reason": "no research goal set"})
            span.end()
            return {
                "is_in_scope": True,
                "is_conversational": False,
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
            query_type = result.get("query_type", "research")
            is_in_scope = query_type != "off_topic"
            is_conversational = query_type == "conversational"
            reason = result.get("reason", "")

        except Exception:
            logger.exception("Guardrail LLM call failed — defaulting to in-scope")
            is_in_scope = True
            is_conversational = False
            reason = "guardrail error, defaulting to allow"

        latency = round((time.time() - t0) * 1000)
        span.update(output={"is_in_scope": is_in_scope, "is_conversational": is_conversational, "reason": reason})
        span.end()

        rejection_message = ""
        if not is_in_scope:
            rejection_message = (
                "I'm here to help with your research! That one's a bit outside what I can assist with — "
                "I'm best at answering questions about your papers, documents, and academic topics. "
                "Feel free to ask me anything related to your knowledge base or research goal."
            )

        return {
            "is_in_scope": is_in_scope,
            "is_conversational": is_conversational,
            "rejection_message": rejection_message,
            "node_timings": {**state.get("node_timings", {}), "guardrail_ms": latency},
        }

    return guardrail_node
