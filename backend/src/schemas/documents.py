import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    original_filename: str
    file_size_bytes: int | None
    mime_type: str | None
    chunks_indexed: bool
    uploaded_at: datetime

    model_config = {"from_attributes": True}
