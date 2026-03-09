import logging

import httpx
from fastapi import HTTPException
from jose import JWTError, jwt
from src.config import get_settings

# Configure the logging and get settings
logger = logging.getLogger(__name__)
settings = get_settings()

# Cache the JWKS so we do not fetch it on every request
_jwks_cache = None


# Define a function to get the jwks
def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        response = httpx.get(settings.clerk_jwks_url, timeout=10)
        response.raise_for_status()
        _jwks_cache = response.json()
        logger.info("Clerk JWKS fetched and cached")
    return _jwks_cache


# Define a function to verify token
def verify_clerk_token(token: str) -> dict:
    try:
        jwks = _get_jwks()
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={"verify_aud": False}, # Clerk tokens have no explicit audience
        )
        return {
            "clerk_id": payload["sub"],
            "email": payload.get("email") or None,
            "display_name": payload.get("name"),
            "avatar_url": payload.get("image_url"),
        }
    except JWTError as e:
        logger.error(f"Clerk token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

