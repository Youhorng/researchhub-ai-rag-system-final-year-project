import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


# Define the project creation class
class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    research_goal: str | None = None
    arxiv_categories: list[str] | None = None
    initial_keywords: list[str] | None = None
    year_from: int | None = None
    year_to: int | None = None


# Define the project update class
class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None

    @field_validator("status")
    @classmethod
    def status_must_be_valid(cls, v):
        if v is not None and v not in ("active", "archived"):
            raise ValueError("status must be 'active' or 'archived'")
        return v


# Define the project response class
class ProjectResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    description: str | None
    research_goal: str | None
    arxiv_categories: list[str] | None
    initial_keywords: list[str] | None
    year_from: int | None
    year_to: int | None
    status: str
    paper_count: int
    document_count: int
    last_synced_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True} 


# Define the topic creation class
class TopicCreate(BaseModel):
    name: str
    arxiv_categories: list[str] | None = None
    keywords: list[str] | None = None
    year_from: int | None = None
    year_to: int | None = None


# Define the topic response class
class TopicResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    arxiv_categories: list[str] | None
    keywords: list[str] | None
    year_from: int | None
    year_to: int | None
    status: str
    added_at: datetime
    
    model_config = {"from_attributes": True}

