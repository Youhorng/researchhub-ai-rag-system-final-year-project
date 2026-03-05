import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.models.base import Base


# A named conversation within a project.
# Each session groups a series of Q&A messages together.
# Example: "Session: Understanding attention mechanisms" within a RAG project.
# A user can have many sessions per project.
class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Scoped to a specific project — RAG search is also project-scoped.
    # This ensures the AI only answers from papers in THIS project.
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )

    # Which user opened this session.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )

    # Auto-generated or user-provided title for this conversation.
    # Example: "What is the difference between RAG and fine-tuning?"
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # When this session was created.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # When the last message was sent — used to sort sessions by recent activity.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    project: Mapped["Project"] = relationship(back_populates="chat_sessions")

    # 1-to-many: a session contains many messages.
    # cascade="all, delete-orphan" deleting a session deletes all its messages.
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


# A single message turn within a chat session.
# Every Q&A pair creates two rows: one with role="user", one with role="assistant".
class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Which session this message belongs to.
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_sessions.id"), nullable=False, index=True
    )

    # "user"      the question the user typed
    # "assistant" the AI-generated answer
    role: Mapped[str] = mapped_column(String(20), nullable=False)

    # The full text of the message.
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # JSONB array of papers/documents that were cited in this response.
    # Only populated for role="assistant" messages.
    # Null means no sources were cited (e.g. for greetings or out-of-scope replies).
    #
    # Format example:
    # [
    #   {
    #     "paper_id": "uuid",
    #     "arxiv_id": "2312.01234",
    #     "title": "Attention Is All You Need",
    #     "authors": ["Vaswani et al."],
    #     "chunk_text": "...the relevant excerpt...",
    #     "relevance_score": 0.87
    #   }
    # ]
    #
    # JSONB (not JSON) — PostgreSQL stores it in binary format for faster querying.
    cited_sources: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)

    # Metadata about how this message was generated.
    # For role="assistant" only. Stores: model name, latency, token counts.
    # Example: {"model": "llama3.2", "latency_ms": 1243, "input_tokens": 512}
    metadata_: Mapped[dict | None] = mapped_column(
        "metadata", JSONB, nullable=True
    )

    # When this message was created.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    session: Mapped["ChatSession"] = relationship(back_populates="messages")

