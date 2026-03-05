import logging
from typing import Annotated
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session
from src.config import Settings, get_settings
from src.database import get_db


# Configure logging
logger = logging.getLogger(__name__)

# Convenience type aliases
DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    # TODO Phase 1.3: verify Clerk JWT and return User model from DB
    return {"token": authorization.removeprefix("Bearer ")}


CurrentUser = Annotated[dict, Depends(get_current_user)]
