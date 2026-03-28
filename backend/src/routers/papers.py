import logging
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from opensearchpy import OpenSearch

from src.dependencies import CurrentUser, DbSession
from src.models.paper import ProjectPaper
from src.models.project import Project
from src.schemas.papers import (
    PaperDiscoverRequest,
    PaperResponse,
    PaperSearchRequest,
    PaperUpdateStatusRequest,
    ProjectPaperResponse,
)
from src.services.indexing.hybrid_indexer import index_paper_chunks
from src.services.opensearch.client import get_os_client
from src.services.paper_service import (
    discover_papers,
    remove_paper_from_project,
    search_and_suggest_papers,
)


# Configure the logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/v1/projects/{project_id}/papers", tags=["papers"])


# Trigger search endpoint
@router.post("/search", response_model=list[PaperResponse])
async def search_papers(
    project_id: uuid.UUID,
    data: PaperSearchRequest,
    db: DbSession,
    current_user: CurrentUser,
    os_client: OpenSearch = Depends(get_os_client)
):
    """Trigger the paper discovery process for a project."""
    
    # Verify the project belongs to the user
    project = db.query(Project).filter_by(id=project_id, owner_id=current_user.id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Call the suggested paper service
    suggested_papers = search_and_suggest_papers(
        db=db,
        os_client=os_client,
        project=project,
        keywords=data.keywords,
        limit=data.limit,
        topic_id=data.topic_id
    )
    
    return suggested_papers


# Discover papers endpoint (combined project + topic search)
@router.post("/discover", response_model=list[PaperResponse])
async def discover_papers_endpoint(
    project_id: uuid.UUID,
    data: PaperDiscoverRequest,
    db: DbSession,
    current_user: CurrentUser,
    os_client: OpenSearch = Depends(get_os_client),
):
    """Discover papers using combined project + topic search parameters."""

    project = db.query(Project).filter_by(id=project_id, owner_id=current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return discover_papers(
        db=db,
        os_client=os_client,
        project=project,
        limit=data.limit,
    )


# List the papers endpoint
@router.get("", response_model=list[ProjectPaperResponse])
async def list_project_papers(
    project_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
    status: str | None = None  # Optional query param to filter by status (?status=accepted)
):
    """Get all papers linked to a specific project."""
    
    # Verify the project belongs to the user
    project = db.query(Project).filter_by(id=project_id, owner_id=current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    # Query the ProjectPaper table, optionally filtering by status
    query = db.query(ProjectPaper).filter(ProjectPaper.project_id == project_id)
    if status:
        query = query.filter(ProjectPaper.status == status)
        
    # Order by relevance score so best papers are first
    project_papers = query.order_by(ProjectPaper.relevance_score.desc()).all()
    
    return project_papers


# Update status endpoint
@router.patch("/{paper_id}", response_model=ProjectPaperResponse)
async def update_paper_status(
    project_id: uuid.UUID,
    paper_id: uuid.UUID,
    data: PaperUpdateStatusRequest,
    db: DbSession,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
):
    """Accept or reject a suggested paper."""

    # Verify the project belongs to the user
    project = db.query(Project).filter_by(id=project_id, owner_id=current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Find the ProjectPaper link
    project_paper = db.query(ProjectPaper).filter_by(
        project_id=project_id,
        paper_id=paper_id
    ).first()

    if not project_paper:
        raise HTTPException(status_code=404, detail="Paper not found in this project")

    from datetime import datetime, timezone

    # Update status if provided
    if data.status is not None:
        old_status = project_paper.status
        project_paper.status = data.status
        project_paper.status_updated_at = datetime.now(timezone.utc)

        # Update the project's denormalized paper count if status changed
        if old_status != "accepted" and data.status == "accepted":
            project.paper_count += 1
        elif old_status == "accepted" and data.status != "accepted":
            project.paper_count = max(project.paper_count - 1, 0)

    # Update topic_id if provided
    if data.topic_id is not None:
        project_paper.topic_id = data.topic_id

    db.commit()
    db.refresh(project_paper)

    # Schedule full-text indexing when a paper is accepted
    if data.status == "accepted":
        paper = project_paper.paper
        if paper.pdf_url and not paper.chunks_indexed:
            logger.info(
                "Scheduling full-text indexing for paper %s (project %s)",
                paper_id, project_id,
            )
            background_tasks.add_task(index_paper_chunks, paper_id, project_id)

    return project_paper


# Remove paper from project endpoint
@router.delete("/{paper_id}", status_code=204)
async def remove_paper(
    project_id: uuid.UUID,
    paper_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    """Remove a paper from a project and clean up its chunks from OpenSearch."""

    project = db.query(Project).filter_by(id=project_id, owner_id=current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    remove_paper_from_project(db=db, project=project, paper_id=paper_id)