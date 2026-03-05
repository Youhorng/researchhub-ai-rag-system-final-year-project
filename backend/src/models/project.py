import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.models.base import Base, TimestampMixin


# The core entity of ResearchHub — a "research silo" that groups papers,
# documents, and chat sessions around a specific research topic.
# Created through the 5-step project creation wizard.
class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    # Primary key — UUID generated in Python, not by the DB.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Foreign key to the user who created this project.
    # index=True speeds up "list all projects for this user" queries.
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )

    # The short display name shown in the dashboard.
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Optional longer description of the project.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Free-text description of what the researcher is studying.
    # This text is embedded by Jina AI to produce a 1024-dim vector,
    # which is then used for semantic (KNN) search against arxiv-metadata.
    research_goal: Mapped[str | None] = mapped_column(Text, nullable=True)

    # List of ArXiv category codes the user selected (["cs.AI", "cs.LG"]).
    # ARRAY(String) is a PostgreSQL-native type — stored as a real array, not JSON.
    # Used as a hard filter in OpenSearch queries.
    arxiv_categories: Mapped[list[str] | None] = mapped_column(
        ARRAY(String), nullable=True
    )

    # Keywords/concepts the user entered (["RAG", "vector database"]).
    # Used for BM25 keyword search against paper titles and abstracts.
    initial_keywords: Mapped[list[str] | None] = mapped_column(
        ARRAY(String), nullable=True
    )

    # Date range filter — only show papers published between these years.
    year_from: Mapped[int | None] = mapped_column(Integer, nullable=True)
    year_to: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # "active" normal, "archived" hidden from dashboard but not deleted.
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active"
    )

    # Denormalized counters — kept in sync by services to avoid expensive COUNT queries.
    paper_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    document_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Timestamp of the last successful topic sync run by Airflow or manual trigger.
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Many-to-1: this project belongs to one user.
    owner: Mapped["User"] = relationship(back_populates="projects")

    # 1-to-many: a project has many topics (Living Knowledge Base).
    # cascade="all, delete-orphan" deleting a project deletes all its topics.
    topics: Mapped[list["ProjectTopic"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )

    # 1-to-many: junction rows linking papers to this project.
    papers: Mapped[list["ProjectPaper"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )

    # 1-to-many: uploaded PDF documents scoped to this project.
    documents: Mapped[list["Document"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )

    # 1-to-many: chat sessions opened within this project.
    chat_sessions: Mapped[list["ChatSession"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )

    # 1-to-many: audit trail of all sync events for this project.
    sync_events: Mapped[list["SyncEvent"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


# A sub-topic within a project for the Living Knowledge Base feature.
# Each topic has its own search parameters and can sync independently.
# Example: a "RAG Survey" project might have topics like "dense retrieval",
# "re-ranking", "evaluation benchmarks" — each with different keywords.
class ProjectTopic(Base):
    __tablename__ = "project_topics"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Which project this topic belongs to.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )

    # Short label for this topic shown in the UI.
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Per-topic search parameters — can differ from the parent project's settings.
    arxiv_categories: Mapped[list[str] | None] = mapped_column(
        ARRAY(String), nullable=True
    )
    keywords: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    year_from: Mapped[int | None] = mapped_column(Integer, nullable=True)
    year_to: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # The exact OpenSearch query string used for the last sync.
    # Saved so we can re-run the identical query in future syncs
    # and only return NEW papers since the last run.
    last_query: Mapped[str | None] = mapped_column(Text, nullable=True)

    # "active" included in syncs, "pruned" excluded (soft delete).
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")

    # When this topic was added to the project.
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Set when the topic is pruned (soft-deleted). Null means still active.
    pruned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    project: Mapped["Project"] = relationship(back_populates="topics")

    # Papers that were suggested/accepted via this topic's sync.
    papers: Mapped[list["ProjectPaper"]] = relationship(back_populates="topic")

    # Sync history for this specific topic.
    sync_events: Mapped[list["SyncEvent"]] = relationship(back_populates="topic")


# Audit trail for every topic sync and drift detection run.
# Every time Airflow or a user triggers a sync, a row is added here.
# This lets you answer: "When did this project last sync? What changed?"
class SyncEvent(Base):
    __tablename__ = "sync_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Which project this sync belongs to.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )

    # Which specific topic was synced (null if it's a project-level operation).
    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_topics.id"), nullable=True
    )

    # Type of event:
    #   "sync"           new papers were fetched for a topic
    #   "clean"          low-relevance papers were flagged or removed
    #   "drift_detected" Airflow found papers drifting from topic
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # How many new papers were added to the project in this sync run.
    papers_added: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # How many papers were removed/rejected during a clean operation.
    papers_removed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Extra details about this sync — error messages, stats, paper IDs added, etc.
    # Flexible JSONB field so we can store any shape of detail without schema changes.
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # What triggered this sync:
    #   "user"      user clicked "Sync Now" in the UI
    #   "scheduler" Airflow ran the daily sync DAG
    triggered_by: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # When the sync ran. No updated_at — sync events are immutable records.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    project: Mapped["Project"] = relationship(back_populates="sync_events")
    topic: Mapped["ProjectTopic | None"] = relationship(back_populates="sync_events")