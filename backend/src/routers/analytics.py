import logging
from collections import Counter
from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func, distinct, desc
from pydantic import BaseModel

from src.database import get_db
from src.dependencies import CurrentUser, DbSession
from src.models.project import Project
from src.models.document import Document
from src.models.chat import ChatSession
from src.models.paper import ProjectPaper, Paper

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/analytics",
    tags=["analytics"],
)

class AnalyticsOverview(BaseModel):
    total_projects: int
    total_papers: int
    total_documents: int
    total_chats: int

class TimeSeriesDataPoint(BaseModel):
    date: str
    count: int

class CategoryDataPoint(BaseModel):
    name: str
    value: int

class ProjectDataPoint(BaseModel):
    name: str
    papers: int

@router.get("/overview", response_model=AnalyticsOverview)
async def get_analytics_overview(
    db: DbSession,
    current_user: CurrentUser
):
    """Get high-level statistics for the current user."""
    
    # Total Projects
    total_projects = db.scalar(
        select(func.count()).select_from(Project).where(Project.owner_id == current_user.id)
    ) or 0
    
    # Total Papers (accepted)
    total_papers = db.scalar(
        select(func.count()).select_from(ProjectPaper)
        .join(Project, ProjectPaper.project_id == Project.id)
        .where(Project.owner_id == current_user.id, ProjectPaper.status == "accepted")
    ) or 0
    
    # Total Documents
    total_documents = db.scalar(
        select(func.count()).select_from(Document)
        .join(Project, Document.project_id == Project.id)
        .where(Project.owner_id == current_user.id)
    ) or 0
    
    # Total Chats
    total_chats = db.scalar(
        select(func.count()).select_from(ChatSession)
        .join(Project, ChatSession.project_id == Project.id)
        .where(Project.owner_id == current_user.id)
    ) or 0

    return AnalyticsOverview(
        total_projects=total_projects,
        total_papers=total_papers,
        total_documents=total_documents,
        total_chats=total_chats
    )

@router.get("/papers-over-time", response_model=list[TimeSeriesDataPoint])
async def get_papers_over_time(
    db: DbSession,
    current_user: CurrentUser,
    days: int = Query(30, description="Number of days to look back"),
):
    """Get papers accepted over time for the user."""
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    # Query timestamps directly and group by day in Python to avoid timezone complexities in db engines
    results = db.execute(
        select(ProjectPaper.status_updated_at)
        .join(Project, ProjectPaper.project_id == Project.id)
        .where(
            Project.owner_id == current_user.id, 
            ProjectPaper.status == "accepted",
            ProjectPaper.status_updated_at >= cutoff_date
        )
    ).scalars().all()
    
    # Group by YYYY-MM-DD
    counter = Counter()
    for ts in results:
        if ts:
            day_str = ts.strftime("%Y-%m-%d")
            counter[day_str] += 1
            
    # Fill in missing days with zeros for a smooth chart
    data = []
    for i in range(days):
        d = cutoff_date + timedelta(days=i)
        day_str = d.strftime("%Y-%m-%d")
        data.append(TimeSeriesDataPoint(date=day_str, count=counter.get(day_str, 0)))
        
    return data

@router.get("/chat-activity", response_model=list[TimeSeriesDataPoint])
async def get_chat_activity(
    db: DbSession,
    current_user: CurrentUser,
    days: int = Query(30, description="Number of days to look back"),
):
    """Get chat sessions created over time for the user."""
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    results = db.execute(
        select(ChatSession.created_at)
        .where(
            ChatSession.user_id == current_user.id,
            ChatSession.created_at >= cutoff_date
        )
    ).scalars().all()
    
    counter = Counter()
    for ts in results:
        if ts:
            day_str = ts.strftime("%Y-%m-%d")
            counter[day_str] += 1
            
    data = []
    for i in range(days):
        d = cutoff_date + timedelta(days=i)
        day_str = d.strftime("%Y-%m-%d")
        data.append(TimeSeriesDataPoint(date=day_str, count=counter.get(day_str, 0)))
        
    return data

@router.get("/papers-by-category", response_model=list[CategoryDataPoint])
async def get_papers_by_category(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(10, description="Top N categories"),
):
    """Get top paper categories among accepted papers."""
    results = db.execute(
        select(Paper.categories)
        .join(ProjectPaper, ProjectPaper.paper_id == Paper.id)
        .join(Project, ProjectPaper.project_id == Project.id)
        .where(Project.owner_id == current_user.id, ProjectPaper.status == "accepted")
    ).scalars().all()
    
    counter = Counter()
    for cat_list in results:
        if cat_list:
            for cat in cat_list:
                counter[cat] += 1
                
    data = [CategoryDataPoint(name=cat, value=count) for cat, count in counter.most_common(limit)]
    return data

@router.get("/papers-by-project", response_model=list[ProjectDataPoint])
async def get_papers_by_project(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(10, description="Top N projects"),
):
    """Get paper counts grouped by project."""
    # We can query projects directly, ordering by paper_count
    projects = db.execute(
        select(Project.name, Project.paper_count)
        .where(Project.owner_id == current_user.id)
        .order_by(desc(Project.paper_count))
        .limit(limit)
    ).all()
    
    data = [ProjectDataPoint(name=p.name, papers=p.paper_count) for p in projects]
    return data
