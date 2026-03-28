"""LLM prompt templates for agent nodes."""

GUARDRAIL_PROMPT = """You are a scope checker for a research assistant chatbot.

A user is working on a research project:
- Research goal: {research_goal}
- Keywords: {keywords}

The user asked: "{query}"

ONLY mark a query as out-of-scope if it is completely unrelated to ANY academic or
research context — for example:
- Casual chat with no substance ("hello", "tell me a joke", "how are you")
- Requests entirely outside academia ("order me a pizza", "what's the weather")
- Harmful or abusive content

Mark the query as IN-SCOPE if it relates to ANY academic topic, methodology, concept,
or could reasonably help someone doing research — even if the topic is not directly
about the specific project keywords. Researchers often explore adjacent fields.

When in doubt, mark as in-scope.

Return JSON:
{{"is_in_scope": true/false, "reason": "brief explanation"}}"""


GRADE_DOCUMENT_PROMPT = """You are a relevance grader for a research assistant.

The user asked: "{query}"

Below are retrieved document chunks. For each chunk, determine if it is relevant
to answering the user's query. A chunk is relevant if it contains information that
could help answer the query, even partially.

Chunks:
{chunks_text}

Return a JSON array with one entry per chunk, in the same order:
[{{"index": 0, "relevant": true/false}}, {{"index": 1, "relevant": true/false}}, ...]"""


REWRITE_QUERY_PROMPT = """You are a query rewriter for a research paper search engine.

The user's original query did not retrieve good results. Rewrite the query to improve
retrieval. Consider:
- Using more specific technical terms
- Expanding acronyms
- Adding related concepts from the research goal

Research goal: {research_goal}
Original query: "{query}"

Return JSON:
{{"rewritten_query": "your improved query"}}"""


HALLUCINATION_CHECK_PROMPT = """You are a fact-checker for a research assistant.

Check if every claim in the answer is supported by the provided source chunks.
A claim is grounded if the source chunks contain evidence for it.

Answer to check:
{answer}

Source chunks:
{chunks_text}

Return JSON:
{{"is_grounded": true/false, "score": 0.0-1.0, "reason": "brief explanation"}}

Where score is the fraction of claims that are supported by the sources (1.0 = fully grounded)."""
