import uuid

from sqlalchemy import desc
from sqlalchemy.orm import Session
from src.models.chat import ChatMessage, ChatSession


def create_session(
    db: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str | None = None,
) -> ChatSession:
    session = ChatSession(
        project_id=project_id,
        user_id=user_id,
        title=title,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, session_id: uuid.UUID) -> ChatSession | None:
    return db.query(ChatSession).filter(ChatSession.id == session_id).first()


def list_sessions(
    db: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[ChatSession]:
    return (
        db.query(ChatSession)
        .filter(
            ChatSession.project_id == project_id,
            ChatSession.user_id == user_id,
        )
        .order_by(desc(ChatSession.updated_at))
        .all()
    )


def add_message(
    db: Session,
    session_id: uuid.UUID,
    role: str,
    content: str,
    cited_sources: list[dict] | None = None,
    metadata_: dict | None = None,
) -> ChatMessage:
    message = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        cited_sources=cited_sources,
        metadata_=metadata_,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def list_messages(
    db: Session,
    session_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
) -> list[ChatMessage]:
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .offset(offset)
        .limit(limit)
        .all()
    )


def get_recent_messages(
    db: Session,
    session_id: uuid.UUID,
    limit: int = 10,
) -> list[ChatMessage]:
    """Return the last N messages in chronological order for conversation context."""
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(desc(ChatMessage.created_at))
        .limit(limit)
        .all()
    )
    return list(reversed(rows))
