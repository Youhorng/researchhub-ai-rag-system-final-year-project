import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from src.dependencies import CurrentUser, DbSession, OsClient
from src.models.project import Project
from src.repositories import chat_repo
from src.schemas.chat import (
    ChatMessageCreate,
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionResponse,
)
from src.services.rag.pipeline import run_rag_pipeline

logger = logging.getLogger(__name__)

SESSION_NOT_FOUND = "Session not found"

router = APIRouter(
    prefix="/api/v1/projects/{project_id}/chat",
    tags=["chat"],
)


def _get_project(db, project_id: uuid.UUID, user_id: uuid.UUID) -> Project:
    project = db.query(Project).filter_by(id=project_id, owner_id=user_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# ── Sessions ──────────────────────────────────────────────────────────


@router.post(
    "/sessions",
    response_model=ChatSessionResponse,
    status_code=201,
    responses={404: {"description": "Project not found"}},
)
async def create_session(
    project_id: uuid.UUID,
    body: ChatSessionCreate,
    db: DbSession,
    current_user: CurrentUser,
):
    """Create a new chat session within a project."""
    _get_project(db, project_id, current_user.id)
    session = chat_repo.create_session(db, project_id, current_user.id, body.title)
    return session


@router.delete(
    "/sessions/{session_id}",
    status_code=204,
    responses={404: {"description": SESSION_NOT_FOUND}},
)
async def delete_session(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    """Delete a chat session and all its messages."""
    _get_project(db, project_id, current_user.id)
    session = chat_repo.get_session(db, session_id)
    if not session or session.project_id != project_id:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)
    chat_repo.delete_session(db, session)


@router.get("/sessions", response_model=list[ChatSessionResponse], responses={404: {"description": "Project not found"}})
async def list_sessions(
    project_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    """List all chat sessions for a project, ordered by most recent."""
    _get_project(db, project_id, current_user.id)
    return chat_repo.list_sessions(db, project_id, current_user.id)


# ── Messages ──────────────────────────────────────────────────────────


@router.get(
    "/sessions/{session_id}/messages",
    response_model=list[ChatMessageResponse],
    responses={404: {"description": SESSION_NOT_FOUND}},
)
async def list_messages(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """List messages in a chat session (paginated, chronological)."""
    _get_project(db, project_id, current_user.id)
    session = chat_repo.get_session(db, session_id)
    if not session or session.project_id != project_id:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)
    return chat_repo.list_messages(db, session_id, limit, offset)


@router.delete(
    "/sessions/{session_id}/messages/{message_id}",
    status_code=204,
    responses={404: {"description": "Session or message not found"}},
)
async def delete_message(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    message_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    """Delete a single message from a chat session."""
    _get_project(db, project_id, current_user.id)
    session = chat_repo.get_session(db, session_id)
    if not session or session.project_id != project_id:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)
    message = chat_repo.get_message(db, message_id)
    if not message or message.session_id != session_id:
        raise HTTPException(status_code=404, detail="Message not found")
    chat_repo.delete_message(db, message)


@router.post(
    "/sessions/{session_id}/messages",
    responses={404: {"description": SESSION_NOT_FOUND}},
)
async def send_message(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    body: ChatMessageCreate,
    db: DbSession,
    current_user: CurrentUser,
    os_client: OsClient,
):
    """Send a message and stream the AI response via SSE."""
    project = _get_project(db, project_id, current_user.id)
    session = chat_repo.get_session(db, session_id)
    if not session or session.project_id != project_id:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)

    # Auto-set session title from first message
    if not session.title:
        session.title = body.content[:80]
        db.commit()

    return EventSourceResponse(
        run_rag_pipeline(
            db=db,
            os_client=os_client,
            user_id=current_user.id,
            project=project,
            session_id=session_id,
            user_query=body.content,
        )
    )
