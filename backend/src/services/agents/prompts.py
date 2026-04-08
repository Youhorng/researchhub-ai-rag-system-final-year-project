"""LLM prompt templates for agent nodes."""

GUARDRAIL_PROMPT = """You are a scope checker for a research assistant chatbot.

A user is working on a research project:
- Research goal: {research_goal}
- Keywords: {keywords}

The user asked: "{query}"

Classify the query into exactly one of three types:

- "conversational": simple greetings, identity questions, small talk, or questions about
  ResearchHub itself (what it is, who built it, who the founder is) that can be answered
  without searching any documents — e.g. "hi", "hello", "how are you", "who are you",
  "what can you do", "thanks", "ok", "great", "who built ResearchHub", "who is the founder".

- "research": relates to ANY academic topic, methodology, concept, or could reasonably
  help someone doing research — even if not directly about the project keywords.
  Also includes questions about the knowledge base contents (listing papers, summaries,
  what has been indexed). When in doubt, use "research".

- "off_topic": completely unrelated to research AND not conversational — e.g.
  "order me a pizza", "what's the weather", harmful or abusive content.

Return JSON:
{{"is_in_scope": true/false, "query_type": "research|conversational|off_topic", "reason": "brief explanation"}}

Rules:
- is_in_scope is true for "research" and "conversational", false for "off_topic"
- Default to "research" when uncertain"""


GRADE_DOCUMENT_PROMPT = """You are a relevance grader for a research assistant.

The user asked: "{query}"

Below are retrieved document chunks. For each chunk, determine if it is relevant
to answering the user's query. A chunk is relevant if it contains information that
could help answer the query, even partially.

Be generous with relevance — if the user asks a broad question (e.g. about findings,
methods, or summaries across papers), any chunk that describes a paper's contributions,
results, methods, abstract, or conclusions should be marked as relevant.

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
