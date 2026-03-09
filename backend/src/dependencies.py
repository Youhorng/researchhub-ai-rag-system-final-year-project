import logging
from typing import Annotated

import src.repositories.user_repo as user_repo
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session
from src.config import Settings, get_settings
from src.database import get_db
from src.models.user import User
from src.services.auth.clerk import verify_clerk_token

# Configure logging
logger = logging.getLogger(__name__)

# Convenience type aliases
DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


# Define async function to get the current user
async def get_current_user(
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> User:

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = authorization.removeprefix("Bearer ")
    payload = verify_clerk_token(token)

    user = user_repo.upsert(
        db=db,
        clerk_id=payload["clerk_id"],
        email=payload["email"],
        display_name=payload["display_name"],
        avatar_url=payload["avatar_url"],
    )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
