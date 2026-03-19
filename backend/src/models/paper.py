import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.models.base import Base, TimestampMixin


# Represents a single ArXiv paper's metadata.
# This is a GLOBAL table — shared across all users and all projects.
# Rows are pre-populated by Airflow (Kaggle bulk load + nightly OAI-PMH updates).
# Users never create rows here directly — they just accept/reject papers
# from this table through the project_papers junction table.
class Paper(Base, TimestampMixin):
    __tablename__ = "papers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # The ArXiv identifier ("2312.01234"). Globally unique for every ArXiv paper.
    # unique=True prevents Airflow from creating duplicate rows on repeated ingestion.
    # index=True speeds up deduplication checks during bulk load.
    arxiv_id: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    # Full paper title. Stored as Text (no length limit) for long titles.
    title: Mapped[str] = mapped_column(Text, nullable=False)

    # List of author names (["Vaswani, A.", "Shazeer, N."]).
    # ARRAY(String) is more query-friendly than a JSON blob.
    authors: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)

    # The full paper abstract — used for:
    #   1. BM25 keyword search in OpenSearch.
    #   2. Embedding via OpenAI → stored in arxiv-metadata index as a 1024-dim vector.
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ArXiv category codes this paper belongs to (["cs.AI", "stat.ML"]).
    # A paper can appear in multiple categories.
    categories: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)

    # The date the paper was first published on ArXiv.
    # Using Date (not DateTime) because we only care about the date, not time.
    published_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Direct PDF download URL from ArXiv ("https://arxiv.org/pdf/2312.01234").
    pdf_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # These two flags track which OpenSearch index this paper has been indexed into.
    # They are updated by background tasks after indexing completes.

    # True when title + abstract have been embedded and stored in the arxiv-metadata index.
    # Used for paper DISCOVERY (project creation wizard search).
    metadata_indexed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # True when full-text PDF chunks have been embedded and stored in the arxiv-chunks index.
    # Used for RAG chat (answering user questions with cited sources).
    chunks_indexed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # Timestamps for when each indexing step completed.
    # Null means "not yet indexed". Useful for debugging and monitoring.
    metadata_indexed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    chunks_indexed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Stores the ID of an active OpenAI Batch API submission handling this paper.
    # Null if not currently in a batch or if already indexed.
    openai_batch_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # 1-to-many: this paper can be linked to many projects via project_papers.
    # No cascade here — deleting a global paper should NOT cascade to projects.
    project_papers: Mapped[list["ProjectPaper"]] = relationship(
        back_populates="paper"
    )


# Junction/linking table between a project and a paper.
# This is where the USER's decision (accept/reject) about a paper is stored.
# A single Paper row can be linked to many different projects — each with
# its own status, relevance score, and source.
#
# Example row:
#   project_id=<RAG Project>  paper_id=<Attention Is All You Need>
#   status="accepted"  relevance_score=0.92  added_by="starter_pack"
class ProjectPaper(Base):
    __tablename__ = "project_papers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Which project this paper is linked to.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )

    # Which paper is being linked.
    paper_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("papers.id"), nullable=False, index=True
    )

    # Which topic's sync brought this paper in. Null if added by user manually.
    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_topics.id"), nullable=True
    )

    # The user's decision on this paper:
    #   "suggested" shown to user but not yet reviewed (initial state)
    #   "accepted" user approved it; triggers full-text indexing into arxiv-chunks
    #   "rejected" user dismissed it; won't show up again
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="suggested"
    )

    # Score from the hybrid search (0.0 to 1.0) — how relevant this paper
    # was to the project's research_goal at the time it was suggested.
    relevance_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # How this paper was added to the project:
    #   "starter_pack" from the initial project creation wizard search
    #   "sync" from a Living Knowledge Base topic sync
    #   "user_search" user manually searched and added it
    added_by: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # When the user changed the status (accepted/rejected).
    # Null means the paper is still "suggested" and not yet reviewed.
    status_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # When this row was created (when the paper was first suggested to this project).
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    project: Mapped["Project"] = relationship(back_populates="papers")
    paper: Mapped["Paper"] = relationship(back_populates="project_papers")

    # Which topic sourced this paper (optional — may be null for manual adds).
    topic: Mapped["ProjectTopic | None"] = relationship(back_populates="papers")
