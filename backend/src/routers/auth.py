import logging

from fastapi import APIRouter, Request
from src.dependencies import CurrentUser
from src.schemas.user import UserResponse

# Configure logging
logger = logging.getLogger(__name__)

# Define the router
router = APIRouter(prefix="/api/v1", tags=["auth"])


# GET /me — return current authenticated user
@router.get("/me", response_model=UserResponse)
async def get_me(user: CurrentUser) -> UserResponse:
    """
    Returns the currently authenticated user.
    On first call, creates the user in the database from their Clerk JWT.
    """
    logger.info("GET /me — user %s", user.clerk_id)
    return UserResponse.model_validate(user)


# GET /me/token — return user info + JWT for easy Postman testing
@router.get("/me/token")
async def get_me_with_token(request: Request, user: CurrentUser) -> dict:
    """
    Returns the current user plus the raw JWT token.
    Useful for grabbing a fresh token for Postman during development.
    """
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else None
    logger.info("GET /me/token — user %s", user.clerk_id)
    return {
        "user": UserResponse.model_validate(user).model_dump(),
        "token": token,
        "message": "Copy the token above and use it as: Authorization: Bearer <token>",
    }
