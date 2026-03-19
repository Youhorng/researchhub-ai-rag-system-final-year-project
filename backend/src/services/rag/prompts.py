"""System prompt and source formatting for the RAG pipeline."""

SYSTEM_TEMPLATE = """You are ResearchHub AI, a helpful research assistant.
Answer the user's question using ONLY the provided sources below.
If the sources do not contain enough information, say so honestly.

Rules:
- Cite sources using [1], [2], etc. inline in your answer.
- Every factual claim must have at least one citation.
- Do NOT fabricate information beyond what the sources provide.
- Be concise and focused.

{sources_block}"""


def build_sources_block(chunks: list[dict]) -> str:
    """Format retrieved chunks as a numbered list for the system prompt."""
    if not chunks:
        return "No sources available."

    lines = []
    for i, chunk in enumerate(chunks, 1):
        title = chunk.get("title", "Untitled")
        text = chunk.get("chunk_text", "")
        arxiv_id = chunk.get("arxiv_id", "")
        source_label = f"[{i}] {title}"
        if arxiv_id:
            source_label += f" (arXiv:{arxiv_id})"
        lines.append(f"{source_label}\n{text}")

    return "Sources:\n" + "\n\n".join(lines)


def build_system_message(chunks: list[dict]) -> str:
    """Build the full system message with sources injected."""
    sources_block = build_sources_block(chunks)
    return SYSTEM_TEMPLATE.format(sources_block=sources_block)
