import logging
import uuid
from datetime import datetime, timezone

from opensearchpy import helpers

from src.config import get_settings
from src.database import SessionLocal
from src.models.paper import Paper
from src.services.embeddings.openai import get_embeddings
from src.services.indexing.text_chunker import chunk_text
from src.services.opensearch.client import get_opensearch_client
from src.services.pdf_parser.parser import parse_pdf_from_url

logger = logging.getLogger(__name__)
settings = get_settings()

EMBED_BATCH_SIZE = 50


def index_paper_chunks(paper_id: uuid.UUID, project_id: uuid.UUID) -> None:
    """Download PDF, chunk, embed, and index into OpenSearch.

    This is designed to run as a FastAPI BackgroundTask. It creates its own
    DB session and OpenSearch client since it runs outside the request lifecycle.

    Chunks are paper-scoped (indexed once globally, shared across all projects).
    Idempotent: skips if any chunks already exist for this paper_id.
    """
    chunk_index = f"{settings.opensearch.index_name}-{settings.opensearch.chunk_index_suffix}"

    db = SessionLocal()
    try:
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            logger.error("Paper %s not found in DB — skipping indexing", paper_id)
            return

        # Chunks are global per paper — shared across all projects that accept it.
        # Skip if any chunks already exist for this paper_id (regardless of project).
        os_client = get_opensearch_client()

        # Reset failure flag if retrying
        if paper.chunks_indexing_failed:
            paper.chunks_indexing_failed = False
            db.commit()

        existing = os_client.count(
            index=chunk_index,
            body={"query": {"term": {"paper_id": str(paper_id)}}},
        )
        if existing["count"] > 0:
            logger.info("Paper %s already indexed globally — skipping", paper.arxiv_id)
            os_client.close()
            if not paper.chunks_indexed:
                paper.chunks_indexed = True
                paper.chunks_indexed_at = datetime.now(timezone.utc)
                db.commit()
            return

        if not paper.pdf_url:
            logger.warning("Paper %s has no pdf_url — skipping", paper.arxiv_id)
            return

        # Step 1: Parse PDF
        logger.info("Starting full-text indexing for paper %s (%s)", paper.arxiv_id, paper_id)
        markdown_text = parse_pdf_from_url(paper.pdf_url)

        # Step 2: Chunk
        chunks = chunk_text(markdown_text)
        if not chunks:
            logger.warning("No chunks produced for paper %s — skipping", paper.arxiv_id)
            return

        logger.info("Produced %d chunks for paper %s", len(chunks), paper.arxiv_id)

        # Step 3: Embed in batches and build bulk actions
        actions: list[dict] = []

        for i in range(0, len(chunks), EMBED_BATCH_SIZE):
            batch = chunks[i : i + EMBED_BATCH_SIZE]
            vectors = get_embeddings(batch)

            for j, (text, vec) in enumerate(zip(batch, vectors)):
                # Skip zero vectors (embedding failures) — cosinesimil rejects them
                if not any(vec):
                    logger.warning(
                        "Skipping zero vector for chunk %d of paper %s", i + j, paper.arxiv_id
                    )
                    continue

                doc = {
                    "chunk_text": text,
                    "chunk_vector": vec,
                    "paper_id": str(paper_id),
                    "arxiv_id": paper.arxiv_id,
                    "title": paper.title,
                }
                actions.append({
                    "_index": chunk_index,
                    "_id": f"{paper_id}_{i + j}",
                    "_source": doc,
                })

            logger.info(
                "Embedded batch %d-%d / %d for paper %s",
                i, min(i + EMBED_BATCH_SIZE, len(chunks)), len(chunks), paper.arxiv_id,
            )

        if not actions:
            logger.warning("No valid embeddings for paper %s — skipping bulk index", paper.arxiv_id)
            return

        # Step 4: Bulk index into OpenSearch
        success, errors = helpers.bulk(os_client, actions, raise_on_error=False)
        logger.info(
            "Bulk indexed %d/%d chunks for paper %s (errors: %s)",
            success, len(actions), paper.arxiv_id, errors if errors else "none",
        )
        if errors:
            logger.warning("Bulk index errors for paper %s: %s", paper.arxiv_id, errors)
        if success == 0:
            raise RuntimeError(
                f"Bulk index wrote 0/{len(actions)} chunks for paper {paper.arxiv_id}"
            )

        os_client.close()

        # Step 5: Mark paper as indexed in Postgres
        paper.chunks_indexed = True
        paper.chunks_indexed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("Paper %s fully indexed ✓", paper.arxiv_id)

    except Exception:
        logger.exception("Failed to index paper %s", paper_id)
        try:
            db.rollback()
            paper = db.query(Paper).filter(Paper.id == paper_id).first()
            if paper:
                paper.chunks_indexing_failed = True
                db.commit()
        except Exception:
            logger.exception("Failed to mark paper %s as indexing_failed", paper_id)
            db.rollback()
    finally:
        db.close()
