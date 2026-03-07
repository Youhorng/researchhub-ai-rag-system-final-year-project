import logging
from fastapi import APIRouter
from src.dependencies import CurrentUser
from src.schemas.user import UserResponse


# Configure logging
logger = logging.getLogger(__name__)

# Define the router
router = APIRouter(prefix="/api/v1", tags=["auth"])


# GET request
@router.get("/me", response_model=UserResponse)
async def get_me(user: CurrentUser) -> UserResponse:
    """
    Returns the currently authenticated user.
    On first call, creates the user in the database from their Clerk JWT.
    """
    
    logger.info("GET /me — user %s", user.clerk_id)
    return UserResponse.model_validate(user)   
