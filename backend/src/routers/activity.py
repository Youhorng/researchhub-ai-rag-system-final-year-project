import logging
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, literal_column, union_all, desc
from pydantic import BaseModel
from datetime import datetime

from src.database import get_db
from src.dependencies import CurrentUser, DbSession
from src.models.project import Project, ProjectTopic
from src.models.document import Document
from src.models.chat import ChatSession
from src.models.paper import ProjectPaper, Paper

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/activity",
    tags=["activity"],
)

class ActivityItem(BaseModel):
    id: str
    type: str
    description: str
    project_id: str
    project_name: str
    timestamp: datetime

class ActivityResponse(BaseModel):
    items: list[ActivityItem]
    total: int
    page: int
    limit: int

class RecentSessionItem(BaseModel):
    id: str
    project_id: str
    project_name: str
    title: str | None
    updated_at: datetime

@router.get("", response_model=ActivityResponse)
async def get_recent_activity(
    db: DbSession,
    current_user: CurrentUser,
    project_id: Optional[uuid.UUID] = Query(None, description="Filter by a specific project"),
    activity_type: Optional[str] = Query(None, description="Filter by activity type"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Results per page"),
):
    """Fetch unified recent activity timeline across user's projects."""

    try:
        # 1. Projects Created
        stmt1 = select(
            Project.id.cast(db.bind.dialect.type_compiler.process(Project.id.type)).label("id"),
            literal_column("'project_created'").label("type"),
            Project.name.label("description"),
            Project.id.cast(db.bind.dialect.type_compiler.process(Project.id.type)).label("project_id"),
            Project.name.label("project_name"),
            Project.created_at.label("timestamp")
        ).where(Project.owner_id == current_user.id)

        # 2. Documents Uploaded
        stmt2 = select(
            Document.id.cast(db.bind.dialect.type_compiler.process(Document.id.type)).label("id"),
            literal_column("'document_uploaded'").label("type"),
            Document.title.label("description"),
            Project.id.cast(db.bind.dialect.type_compiler.process(Project.id.type)).label("project_id"),
            Project.name.label("project_name"),
            Document.uploaded_at.label("timestamp")
        ).join(Project, Document.project_id == Project.id).where(Project.owner_id == current_user.id)

        # 3. Chat Sessions Created
        stmt3 = select(
            ChatSession.id.cast(db.bind.dialect.type_compiler.process(ChatSession.id.type)).label("id"),
            literal_column("'chat_created'").label("type"),
            ChatSession.title.label("description"),
            Project.id.cast(db.bind.dialect.type_compiler.process(Project.id.type)).label("project_id"),
            Project.name.label("project_name"),
            ChatSession.created_at.label("timestamp")
        ).join(Project, ChatSession.project_id == Project.id).where(ChatSession.user_id == current_user.id)

        # 4. Topics Added
        stmt4 = select(
            ProjectTopic.id.cast(db.bind.dialect.type_compiler.process(ProjectTopic.id.type)).label("id"),
            literal_column("'topic_created'").label("type"),
            ProjectTopic.name.label("description"),
            Project.id.cast(db.bind.dialect.type_compiler.process(Project.id.type)).label("project_id"),
            Project.name.label("project_name"),
            ProjectTopic.added_at.label("timestamp")
        ).join(Project, ProjectTopic.project_id == Project.id).where(Project.owner_id == current_user.id)

        # 5. Papers Accepted/Rejected
        # We handle PostgreSQL string concatenation for status dynamically.
        stmt5 = select(
            ProjectPaper.id.cast(db.bind.dialect.type_compiler.process(ProjectPaper.id.type)).label("id"),
            (literal_column("'paper_'") + ProjectPaper.status).label("type"),
            Paper.title.label("description"),
            Project.id.cast(db.bind.dialect.type_compiler.process(Project.id.type)).label("project_id"),
            Project.name.label("project_name"),
            ProjectPaper.status_updated_at.label("timestamp")
        ).join(Project, ProjectPaper.project_id == Project.id)\
         .join(Paper, ProjectPaper.paper_id == Paper.id)\
         .where(Project.owner_id == current_user.id, ProjectPaper.status_updated_at.is_not(None))

        # We must cast UUIDs to strings beforehand so that UNION ALL works safely across all types
        # Actually sqlalchemy 'cast(col, String)' is universally supported
        from sqlalchemy import String, cast
        for i, stmt in enumerate([stmt1, stmt2, stmt3, stmt4, stmt5]):
            # Overwrite selects using cast
            pass # handled above by casting natively or we can just use cast(c, String).
            
        # Refined simpler string casting
        stmt1 = select(cast(Project.id, String).label("id"), literal_column("'project_created'").label("type"), Project.name.label("description"), cast(Project.id, String).label("project_id"), Project.name.label("project_name"), Project.created_at.label("timestamp")).where(Project.owner_id == current_user.id)
        stmt2 = select(cast(Document.id, String).label("id"), literal_column("'document_uploaded'").label("type"), Document.title.label("description"), cast(Project.id, String).label("project_id"), Project.name.label("project_name"), Document.uploaded_at.label("timestamp")).join(Project, Document.project_id == Project.id).where(Project.owner_id == current_user.id)
        stmt3 = select(cast(ChatSession.id, String).label("id"), literal_column("'chat_created'").label("type"), ChatSession.title.label("description"), cast(Project.id, String).label("project_id"), Project.name.label("project_name"), ChatSession.created_at.label("timestamp")).join(Project, ChatSession.project_id == Project.id).where(ChatSession.user_id == current_user.id)
        stmt4 = select(cast(ProjectTopic.id, String).label("id"), literal_column("'topic_created'").label("type"), ProjectTopic.name.label("description"), cast(Project.id, String).label("project_id"), Project.name.label("project_name"), ProjectTopic.added_at.label("timestamp")).join(Project, ProjectTopic.project_id == Project.id).where(Project.owner_id == current_user.id)
        
        # for paper status concats, some DBs require specialized syntax but PostgreSQL supports ||. SQLAlchemy literal_column + takes care of it usually, or func.concat.
        from sqlalchemy import func
        stmt5 = select(cast(ProjectPaper.id, String).label("id"), func.concat('paper_', ProjectPaper.status).label("type"), Paper.title.label("description"), cast(Project.id, String).label("project_id"), Project.name.label("project_name"), ProjectPaper.status_updated_at.label("timestamp")).join(Project, ProjectPaper.project_id == Project.id).join(Paper, ProjectPaper.paper_id == Paper.id).where(Project.owner_id == current_user.id, ProjectPaper.status_updated_at.is_not(None))

        subq = union_all(stmt1, stmt2, stmt3, stmt4, stmt5).subquery()
        
        final_query = select(subq)
        
        # Apply filters to the combined feed
        if project_id:
            final_query = final_query.where(subq.c.project_id == str(project_id))
        
        if activity_type:
            final_query = final_query.where(subq.c.type == activity_type)
            
        # Count total
        count_query = select(func.count()).select_from(final_query.subquery())
        total_items = db.scalar(count_query) or 0
        
        # Pagination & Ordering
        final_query = final_query.order_by(desc(subq.c.timestamp))
        final_query = final_query.offset((page - 1) * limit).limit(limit)
        
        results = db.execute(final_query).fetchall()
        
        items = []
        for row in results:
            items.append(ActivityItem(
                id=row.id,
                type=row.type,
                description=row.description or "Untitled",
                project_id=row.project_id,
                project_name=row.project_name,
                timestamp=row.timestamp
            ))
            
        return ActivityResponse(
            items=items,
            total=total_items,
            page=page,
            limit=limit
        )
    except Exception as e:
        logger.exception("Failed to fetch activity feed")
        raise HTTPException(status_code=500, detail="Internal server error fetching activity feed")


@router.get("/recent-sessions", response_model=list[RecentSessionItem])
async def get_recent_chat_sessions(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(5, ge=1, le=20),
):
    """Return the most recent chat sessions across all user projects."""
    from sqlalchemy import String, cast, desc, select
    results = db.execute(
        select(
            cast(ChatSession.id, String).label("id"),
            cast(ChatSession.project_id, String).label("project_id"),
            Project.name.label("project_name"),
            ChatSession.title,
            ChatSession.updated_at,
        )
        .join(Project, ChatSession.project_id == Project.id)
        .where(ChatSession.user_id == current_user.id)
        .where(ChatSession.project_id.is_not(None))
        .order_by(desc(ChatSession.updated_at))
        .limit(limit)
    ).fetchall()

    return [
        RecentSessionItem(
            id=row.id,
            project_id=row.project_id,
            project_name=row.project_name,
            title=row.title,
            updated_at=row.updated_at,
        )
        for row in results
    ]
