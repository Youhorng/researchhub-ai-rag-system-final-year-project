"""System prompt and source formatting for the RAG pipeline."""

SYSTEM_TEMPLATE = """You are ResearchHub AI, a helpful research assistant.
Answer the user's question based on the provided sources below.
Synthesize information from the sources to give a comprehensive answer.

Rules:
- Cite sources using [1], [2], etc. inline in your answer.
- Every factual claim must have at least one citation.
- Do NOT fabricate information beyond what the sources provide.
- If the sources contain partial information, summarize what is available
  and note what is not covered.
- Be thorough when the user asks about multiple papers — cover each source.

{kb_block}{sources_block}"""

SYSTEM_TEMPLATE_NO_SOURCES = """You are ResearchHub AI, a helpful research assistant.

{kb_block}No relevant source excerpts were found for this specific question.
If the user is asking about what papers or documents are in their knowledge base,
use the knowledge base inventory above to answer.
Otherwise, you may answer from your general knowledge, but you MUST:
- Start your answer with a brief note: "I couldn't find relevant sources in your knowledge base for this question, but here's what I know:"
- Answer helpfully and accurately from general knowledge.
- Do NOT use citation markers like [1], [2] since there are no sources.
- Be concise and focused."""


def group_chunks_by_source(chunks: list[dict]) -> list[dict]:
    """Group chunks by paper/document into unique sources with merged excerpts."""
    groups: dict[str, dict] = {}
    order: list[str] = []

    for chunk in chunks:
        key = (
            chunk.get("paper_id")
            or chunk.get("document_id")
            or chunk.get("arxiv_id")
            or chunk.get("title")
            or ""
        )
        key = str(key)

        if not key or key not in groups:
            # Use a unique fallback key for chunks without identifiers
            if not key:
                key = f"_chunk_{len(groups)}"
            groups[key] = {
                "paper_id": chunk.get("paper_id"),
                "document_id": chunk.get("document_id"),
                "arxiv_id": chunk.get("arxiv_id"),
                "title": chunk.get("title"),
                "excerpts": [],
            }
            order.append(key)

        groups[key]["excerpts"].append(chunk.get("chunk_text", ""))

    return [groups[k] for k in order]


def _compute_ngrams(text: str, n: int = 4) -> set[tuple[str, ...]]:
    """Compute word n-grams from text for similarity comparison."""
    words = text.lower().split()
    if len(words) < n:
        return set()
    return {tuple(words[i : i + n]) for i in range(len(words) - n + 1)}


def merge_duplicate_sources(grouped_sources: list[dict]) -> list[dict]:
    """Merge sources that are the same paper but have different IDs.

    Detects duplicates via 4-gram overlap coefficient — catches cases like
    an arxiv paper and an uploaded PDF of the same paper that share content
    but have completely different paper_id / document_id / title.
    """
    if len(grouped_sources) <= 1:
        return grouped_sources

    # Pre-compute n-grams for each source's combined excerpts
    ngrams_per_source = []
    for src in grouped_sources:
        combined = " ".join(src.get("excerpts", []))
        ngrams_per_source.append(_compute_ngrams(combined))

    merge_target: dict[int, int] = {}  # j → i (j is merged into i)

    for i in range(len(grouped_sources)):
        if i in merge_target:
            continue
        for j in range(i + 1, len(grouped_sources)):
            if j in merge_target:
                continue
            if not ngrams_per_source[i] or not ngrams_per_source[j]:
                continue

            intersection = ngrams_per_source[i] & ngrams_per_source[j]
            smaller = min(len(ngrams_per_source[i]), len(ngrams_per_source[j]))
            overlap = len(intersection) / smaller if smaller else 0

            if overlap > 0.15:
                merge_target[j] = i
                # Merge excerpts into the keeper
                grouped_sources[i]["excerpts"].extend(grouped_sources[j]["excerpts"])
                # Prefer metadata with a proper title over a filename
                src_i = grouped_sources[i]
                src_j = grouped_sources[j]
                title_i = src_i.get("title", "")
                j_has_better_meta = (
                    (src_j.get("arxiv_id") and not src_i.get("arxiv_id"))
                    or title_i.endswith((".pdf", ".PDF"))
                )
                if j_has_better_meta:
                    for field in ("paper_id", "document_id", "arxiv_id", "title"):
                        if src_j.get(field):
                            src_i[field] = src_j[field]
                # Expand n-grams for transitive matching
                ngrams_per_source[i] |= ngrams_per_source[j]

    return [src for idx, src in enumerate(grouped_sources) if idx not in merge_target]


def build_sources_block(grouped_sources: list[dict]) -> str:
    """Format grouped sources as a numbered list for the system prompt."""
    if not grouped_sources:
        return "No sources available."

    lines = []
    for i, source in enumerate(grouped_sources, 1):
        title = source.get("title", "Untitled")
        arxiv_id = source.get("arxiv_id", "")
        source_label = f"[{i}] {title}"
        if arxiv_id:
            source_label += f" (arXiv:{arxiv_id})"

        excerpts = source.get("excerpts", [])
        if len(excerpts) == 1:
            text = excerpts[0]
        else:
            text = "\n---\n".join(excerpts)

        lines.append(f"{source_label}\n{text}")

    return "Sources:\n" + "\n\n".join(lines)


def _build_kb_block(paper_titles: list[str]) -> str:
    """Format the knowledge base inventory block for the system prompt."""
    if not paper_titles:
        return ""
    listing = "\n".join(f"- {t}" for t in paper_titles)
    return (
        f"The user's knowledge base contains the following papers/documents:\n"
        f"{listing}\n\n"
    )


def build_system_message(
    chunks: list[dict],
    grouped_sources: list[dict] | None = None,
    paper_titles: list[str] | None = None,
) -> str:
    """Build the full system message with sources injected.

    If grouped_sources is provided, uses it directly (avoids re-grouping).
    Otherwise groups and deduplicates from raw chunks.
    paper_titles is an optional list of all accepted paper/document titles
    in the project's knowledge base.
    """
    kb_block = _build_kb_block(paper_titles or [])
    if not chunks and not grouped_sources:
        return SYSTEM_TEMPLATE_NO_SOURCES.format(kb_block=kb_block)
    if grouped_sources is None:
        grouped_sources = group_chunks_by_source(chunks)
        grouped_sources = merge_duplicate_sources(grouped_sources)
    sources_block = build_sources_block(grouped_sources)
    return SYSTEM_TEMPLATE.format(kb_block=kb_block, sources_block=sources_block)
