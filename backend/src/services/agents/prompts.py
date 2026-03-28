"""LLM prompt templates for agent nodes."""

GUARDRAIL_PROMPT = """You are a research assistant scope checker.

A user is working on a research project with the following details:
- Research goal: {research_goal}
- Keywords: {keywords}

The user asked: "{query}"

Determine whether this query is relevant to the research project described above.
A query is in-scope if it relates to the research goal, keywords, or could reasonably
help the user with their research (e.g. asking for summaries, comparisons, methodology
questions, or related concepts).

A query is out-of-scope if it is completely unrelated to the research project
(e.g. asking about cooking recipes in a machine learning project).

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
