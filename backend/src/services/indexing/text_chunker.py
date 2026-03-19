import re
import logging

from src.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks suitable for embedding.

    If section_based chunking is enabled, splits on markdown headings first,
    then applies a sliding window within each section. Otherwise, applies the
    sliding window directly to the whole text.

    Returns:
        List of text chunks (short chunks below min_chunk_size are dropped).
    """
    cfg = settings.chunking

    if cfg.section_based:
        sections = _split_into_sections(text)
        chunks: list[str] = []
        for section in sections:
            chunks.extend(
                _fixed_size_chunk(section, cfg.chunk_size, cfg.overlap_size)
            )
    else:
        chunks = _fixed_size_chunk(text, cfg.chunk_size, cfg.overlap_size)

    # Drop chunks that are too short to be useful
    chunks = [c for c in chunks if len(c) >= cfg.min_chunk_size]

    logger.info("Chunked text into %d chunks (section_based=%s)", len(chunks), cfg.section_based)
    return chunks


def _split_into_sections(text: str) -> list[str]:
    """Split markdown text on heading lines (# ...).

    Each section includes its heading line. Text before the first heading
    is returned as its own section if non-empty.
    """
    # Split on lines that start with one or more # characters
    parts = re.split(r"(?m)^(?=#{1,6}\s)", text)
    sections = [p.strip() for p in parts if p.strip()]
    return sections


def _fixed_size_chunk(text: str, chunk_size: int, overlap: int) -> list[str]:
    """Sliding-window chunker that tries to break on sentence boundaries.

    Args:
        text: Input text to chunk.
        chunk_size: Target number of characters per chunk.
        overlap: Number of characters to overlap between consecutive chunks.

    Returns:
        List of text chunks.
    """
    if not text or not text.strip():
        return []

    text = text.strip()
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = start + chunk_size

        # If we haven't reached the end, try to break at a sentence boundary
        if end < len(text):
            # Look for the last sentence-ending punctuation within the window
            window = text[start:end]
            # Find last '. ' or '.\n' or '? ' or '! ' in the window
            best_break = -1
            for sep in [". ", ".\n", "? ", "! ", "?\n", "!\n"]:
                pos = window.rfind(sep)
                if pos > best_break:
                    best_break = pos

            if best_break > chunk_size // 3:
                # Break after the punctuation character
                end = start + best_break + 1

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Advance by (end - start - overlap), but at least 1 to avoid infinite loop
        step = max(end - start - overlap, 1)
        start += step

    return chunks
