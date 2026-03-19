import uuid
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict


# Define the base paper class
class PaperResponse(BaseModel):
    id: uuid.UUID
    arxiv_id: str
    title: str
    authors: list[str]
    abstract: str | None
    categories: list[str]
    published_at: date | None
    pdf_url: str | None

    model_config = ConfigDict(from_attributes=True)


class ProjectPaperResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    paper: PaperResponse  # Nested global paper details
    status: str           # "suggested", "accepted", "rejected"
    relevance_score: float | None
    added_by: str | None
    added_at: datetime
    status_updated_at: datetime | None
    
    model_config = ConfigDict(from_attributes=True)


class PaperSearchRequest(BaseModel):
    keywords: list[str]
    limit: int = 10


class PaperUpdateStatusRequest(BaseModel):
    status: str  # "accepted" or "rejected"
