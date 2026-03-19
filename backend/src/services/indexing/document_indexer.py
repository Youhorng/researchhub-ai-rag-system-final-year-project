import logging
import uuid
from datetime import datetime, timezone

from opensearchpy import helpers
from src.config import get_settings
from src.database import SessionLocal
from src.models.document import Document
from src.services.embeddings.openai import get_embeddings
from src.services.indexing.text_chunker import chunk_text
from src.services.opensearch.client import get_opensearch_client
from src.services.pdf_parser.parser import parse_pdf_from_bytes
from src.services.storage.minio_client import download_file, get_minio_client

logger = logging.getLogger(__name__)
settings = get_settings()

EMBED_BATCH_SIZE = 50


def index_document_chunks(document_id: uuid.UUID, project_id: uuid.UUID) -> None:
    """Download PDF from MinIO, chunk, embed, and index into OpenSearch.

    Designed to run as a FastAPI BackgroundTask. Creates its own DB session
    and clients since it runs outside the request lifecycle.

    Idempotent: skips if document.chunks_indexed is already True.
    """
    chunk_index = f"{settings.opensearch.index_name}-{settings.opensearch.chunk_index_suffix}"

    db = SessionLocal()
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            logger.error("Document %s not found in DB — skipping indexing", document_id)
            return

        if document.chunks_indexed:
            logger.info("Document %s already indexed — skipping", document_id)
            return

        # Step 1: Download PDF from MinIO
        logger.info("Starting indexing for document %s (%s)", document.title, document_id)
        minio = get_minio_client()
        pdf_bytes = download_file(minio, document.minio_key)

        # Step 2: Parse PDF
        text = parse_pdf_from_bytes(pdf_bytes)

        # Step 3: Chunk
        chunks = chunk_text(text)
        if not chunks:
            logger.warning("No chunks produced for document %s — skipping", document_id)
            return

        logger.info("Produced %d chunks for document %s", len(chunks), document.title)

        # Step 4: Embed in batches and build bulk actions
        os_client = get_opensearch_client()
        actions: list[dict] = []

        for i in range(0, len(chunks), EMBED_BATCH_SIZE):
            batch = chunks[i : i + EMBED_BATCH_SIZE]
            vectors = get_embeddings(batch)

            for j, (chunk_text_str, vec) in enumerate(zip(batch, vectors)):
                if all(v == 0.0 for v in vec):
                    logger.warning(
                        "Skipping zero vector for chunk %d of document %s", i + j, document_id
                    )
                    continue

                doc = {
                    "chunk_text": chunk_text_str,
                    "chunk_vector": vec,
                    "paper_id": "",
                    "document_id": str(document_id),
                    "project_id": str(project_id),
                    "arxiv_id": "",
                    "title": document.title,
                }
                actions.append({
                    "_index": chunk_index,
                    "_id": f"{document_id}_{i + j}",
                    "_source": doc,
                })

            logger.info(
                "Embedded batch %d-%d / %d for document %s",
                i, min(i + EMBED_BATCH_SIZE, len(chunks)), len(chunks), document.title,
            )

        if not actions:
            logger.warning("No valid embeddings for document %s — skipping bulk index", document_id)
            return

        # Step 5: Bulk index into OpenSearch
        success, errors = helpers.bulk(os_client, actions, raise_on_error=False)
        logger.info(
            "Bulk indexed %d/%d chunks for document %s (errors: %s)",
            success, len(actions), document.title, errors if errors else "none",
        )

        os_client.close()

        # Step 6: Mark document as indexed in Postgres
        document.chunks_indexed = True
        document.chunks_indexed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("Document %s fully indexed ✓", document.title)

    except Exception:
        logger.exception("Failed to index document %s", document_id)
        db.rollback()
    finally:
        db.close()
