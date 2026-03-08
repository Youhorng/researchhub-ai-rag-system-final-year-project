import logging
import uuid
from fastapi import APIRouter

from src.dependencies import DbSession, CurrentUser
from src.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    TopicCreate,
    TopicResponse,
)
import src.services.project_service as project_service


# Configure the logging
logger = logging.getLogger(__name__)

# Create the router
router = APIRouter(prefix="/api/v1", tags=["projects"])

# Main project endpoints
@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    data: ProjectCreate,
    db: DbSession,
    current_user: CurrentUser,
):
    return project_service.create_project(db, current_user, data)


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(
    db: DbSession,
    current_user: CurrentUser,
    include_archived: bool = False,
):
    return project_service.list_projects(db, current_user, include_archived)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    return project_service.get_project(db, current_user, project_id)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    db: DbSession,
    current_user: CurrentUser,
):
    return project_service.update_project(db, current_user, project_id, data)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    project_service.delete_project(db, current_user, project_id)


# Main topic endpoints
@router.post(
    "/projects/{project_id}/topics",
    response_model=TopicResponse,
    status_code=201,
)
async def add_topic(
    project_id: uuid.UUID,
    data: TopicCreate,
    db: DbSession,
    current_user: CurrentUser,
):
    return project_service.add_topic(db, current_user, project_id, data)


@router.get("/projects/{project_id}/topics", response_model=list[TopicResponse])
async def list_topics(
    project_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    return project_service.list_topics(db, current_user, project_id)