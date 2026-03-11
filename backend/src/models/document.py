import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.models.base import Base


# Represents a PDF file uploaded by the user to a specific project.
# The actual file bytes are NOT stored in PostgreSQL — they live in MinIO
# (object storage). This table stores only the reference (bucket + key)
# and metadata about the file.
#
# After upload, a background task:
#   1. Fetches the file from MinIO
#   2. Parses text with docling
#   3. Splits into chunks (600 chars, 100 overlap)
#   4. Embeds chunks with OpenAI
#   5. Indexes chunks into OpenSearch arxiv-chunks index
#   6. Sets chunks_indexed = True here
class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Which project this document belongs to.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )

    # Display title for the document shown in the UI.
    # Defaults to the original filename if not set by the user.
    title: Mapped[str] = mapped_column(String(255), nullable=False)

    # The original filename as the user uploaded it (e.g. "attention_paper.pdf").
    # Stored for display purposes — the actual storage key in MinIO is different.
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)

    # MinIO organises files into "buckets" (like top-level folders).
    # Our bucket name is typically "researchhub-documents".
    minio_bucket: Mapped[str] = mapped_column(String(255), nullable=False)

    # The unique path/key inside the bucket where the file is stored.
    # Format: "{project_id}/{document_id}/{original_filename}"
    # Example: "a1b2c3/d4e5f6/attention_paper.pdf"
    minio_key: Mapped[str] = mapped_column(String(512), nullable=False)

    # File size in bytes. BigInteger supports files up to ~9.2 exabytes.
    # Stored so the UI can show "3.2 MB" without fetching from MinIO.
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # MIME type of the uploaded file (e.g. "application/pdf").
    # Currently we only support PDF, but this future-proofs other formats.
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # True when this document's text chunks have been indexed into arxiv-chunks.
    # The RAG pipeline searches arxiv-chunks, so this must be True before
    # the document's content can appear in chat answers.
    chunks_indexed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # When indexing completed. Null means still in progress or failed.
    chunks_indexed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # When the user uploaded this file (set automatically by the DB on INSERT).
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Back-reference to the project this document belongs to.
    project: Mapped["Project"] = relationship(back_populates="documents")
