"""System prompt and source formatting for the RAG pipeline."""

ABOUT_RESEARCHHUB = """About ResearchHub (authoritative — overrides any sources):
ResearchHub is an AI-powered academic research platform that helps researchers discover, organise, and chat with research papers using retrieval-augmented generation (RAG). It was built as a final-year project by Kean Youhorng, a senior student at the American University of Phnom Penh. Kean Youhorng is the sole builder, founder, and creator of ResearchHub.

If the user asks about ResearchHub, who built it, who created it, who the founder/author/developer is, or any similar question about the platform itself, you MUST answer using ONLY the information above. Ignore any names, authors, or affiliations from the retrieved sources for these questions — the sources are unrelated research papers and do NOT describe ResearchHub. Do NOT cite sources [1]..[N] when answering questions about ResearchHub itself."""

SYSTEM_TEMPLATE = """You are ResearchHub AI, a helpful research assistant.
Answer the user's question based on the provided sources below.
Synthesize information from the sources to give a comprehensive answer.

{about_block}
Citation rules (CRITICAL — you MUST follow these):
- You have exactly {num_sources} source(s) numbered [1] through [{num_sources}].
- You MUST place inline citation markers [1], [2], etc. at the end of every sentence that uses information from a source.
- Only use citation numbers [1] through [{num_sources}]. Never cite [N] for N > {num_sources}.
- Do NOT fabricate information beyond what the sources provide.
- EXCEPTION: questions about ResearchHub itself (the platform, its builder, founder, or creator) must be answered from the "About ResearchHub" block above without citing any sources.
- If the sources contain partial information, summarize what is available
  and note what is not covered.
- Be thorough when the user asks about multiple papers — cover each source.

IMPORTANT — here is an example of the CORRECT citation format you must use:
<example>
User: What are the key findings?
Assistant: The study found that **transformer models** outperform RNNs on long-range dependencies [1]. Additionally, **retrieval-augmented generation** improves factual accuracy by grounding responses in external documents [2]. When combining both approaches, the system achieved a **12% improvement** in F1 score [1][3].
</example>
WRONG (never do this): Using paper titles as headers like "Paper Title\nThe paper discusses..."
RIGHT: Weave citations naturally into sentences like "The paper proposes X [1] and Y [2]."

Formatting rules:
- Do NOT start your answer with a title or heading. Begin directly with the content.
- Use **bold** for key terms, model names, and important values.
- Use *italic* for emphasis or paper titles inline.
- Use `###` headers only to separate major sections within a long answer — never as a title at the top.
- Use bullet lists or numbered lists where appropriate.
- For ALL math, variables, and symbols use KaTeX delimiters ONLY: $...$ for inline (e.g. $z$, $\beta_0$, $f(z)$) and $$...$$ for block equations. NEVER use ( ), \( \), \[ \], or plain text for math notation.

{kb_block}{sources_block}"""

SYSTEM_TEMPLATE_NO_SOURCES = """You are ResearchHub AI, a helpful research assistant.

{about_block}
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


def _compute_overlap(ngrams_a: set, ngrams_b: set) -> float:
    """Return the overlap coefficient between two n-gram sets."""
    if not ngrams_a or not ngrams_b:
        return 0.0
    smaller = min(len(ngrams_a), len(ngrams_b))
    return len(ngrams_a & ngrams_b) / smaller


def _merge_source_metadata(src_i: dict, src_j: dict) -> None:
    """Merge src_j's metadata into src_i if src_j has better quality metadata."""
    title_i = src_i.get("title", "")
    j_has_better_meta = (
        (src_j.get("arxiv_id") and not src_i.get("arxiv_id"))
        or title_i.endswith((".pdf", ".PDF"))
    )
    if j_has_better_meta:
        for field in ("paper_id", "document_id", "arxiv_id", "title"):
            if src_j.get(field):
                src_i[field] = src_j[field]


def _build_merge_targets(
    grouped_sources: list[dict],
    ngrams_per_source: list[set],
) -> dict[int, int]:
    """Return a mapping j→i for sources that should be merged (j merged into i)."""
    merge_target: dict[int, int] = {}
    for i in range(len(grouped_sources)):
        if i in merge_target:
            continue
        for j in range(i + 1, len(grouped_sources)):
            if j in merge_target:
                continue
            if _compute_overlap(ngrams_per_source[i], ngrams_per_source[j]) > 0.15:
                merge_target[j] = i
                grouped_sources[i]["excerpts"].extend(grouped_sources[j]["excerpts"])
                _merge_source_metadata(grouped_sources[i], grouped_sources[j])
                ngrams_per_source[i] |= ngrams_per_source[j]
    return merge_target


def merge_duplicate_sources(grouped_sources: list[dict]) -> list[dict]:
    """Merge sources that are the same paper but have different IDs.

    Detects duplicates via 4-gram overlap coefficient — catches cases like
    an arxiv paper and an uploaded PDF of the same paper that share content
    but have completely different paper_id / document_id / title.
    """
    if len(grouped_sources) <= 1:
        return grouped_sources

    ngrams_per_source = [
        _compute_ngrams(" ".join(src.get("excerpts", [])))
        for src in grouped_sources
    ]
    merge_target = _build_merge_targets(grouped_sources, ngrams_per_source)
    return [src for idx, src in enumerate(grouped_sources) if idx not in merge_target]


_INTERNAL_CITE_RE = __import__("re").compile(r"\[\d+\]")


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
        # Strip internal paper citations (e.g. [16], [1]) from excerpt text
        # so they don't bleed into the LLM's citation numbering
        cleaned = [_INTERNAL_CITE_RE.sub("", e) for e in excerpts]
        text = "\n\n".join(cleaned)

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
        return SYSTEM_TEMPLATE_NO_SOURCES.format(about_block=ABOUT_RESEARCHHUB, kb_block=kb_block)
    if grouped_sources is None:
        grouped_sources = group_chunks_by_source(chunks)
        grouped_sources = merge_duplicate_sources(grouped_sources)
    num_sources = len(grouped_sources)
    sources_block = build_sources_block(grouped_sources)
    return SYSTEM_TEMPLATE.format(
        about_block=ABOUT_RESEARCHHUB,
        num_sources=num_sources,
        kb_block=kb_block,
        sources_block=sources_block,
    )
