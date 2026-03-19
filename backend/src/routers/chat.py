import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from opensearchpy import OpenSearch
from src.dependencies import CurrentUser, DbSession
from src.models.project import Project
from src.repositories import chat_repo
from src.schemas.chat import (
    ChatMessageCreate,
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionResponse,
)
from src.services.opensearch.client import get_os_client
from src.services.rag.pipeline import run_rag_pipeline
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

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


@router.post("/sessions", response_model=ChatSessionResponse, status_code=201)
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


@router.get("/sessions", response_model=list[ChatSessionResponse])
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
)
async def list_messages(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List messages in a chat session (paginated, chronological)."""
    _get_project(db, project_id, current_user.id)
    session = chat_repo.get_session(db, session_id)
    if not session or session.project_id != project_id:
        raise HTTPException(status_code=404, detail="Session not found")
    return chat_repo.list_messages(db, session_id, limit, offset)


@router.post("/sessions/{session_id}/messages")
async def send_message(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    body: ChatMessageCreate,
    db: DbSession,
    current_user: CurrentUser,
    os_client: OpenSearch = Depends(get_os_client),
):
    """Send a message and stream the AI response via SSE."""
    _get_project(db, project_id, current_user.id)
    session = chat_repo.get_session(db, session_id)
    if not session or session.project_id != project_id:
        raise HTTPException(status_code=404, detail="Session not found")

    # Auto-set session title from first message
    if not session.title:
        session.title = body.content[:80]
        db.commit()

    return EventSourceResponse(
        run_rag_pipeline(
            db=db,
            os_client=os_client,
            user_id=current_user.id,
            project_id=project_id,
            session_id=session_id,
            user_query=body.content,
        )
    )
