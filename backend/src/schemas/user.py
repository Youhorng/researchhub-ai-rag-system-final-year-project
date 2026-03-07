import uuid
from datetime import datetime
from pydantic import BaseModel


# Define user response class
class UserResponse(BaseModel):
    id: uuid.UUID
    clerk_id: str
    email: str
    display_name: str | None
    avatar_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}