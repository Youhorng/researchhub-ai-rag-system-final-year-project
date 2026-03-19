import logging

import httpx
from src.config import get_settings

# Configure logging and settings
logger = logging.getLogger(__name__)
settings = get_settings()


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Call OpenAI API to get embeddings for a list of texts.
    Returns a list of vectors (each 1024-dimensional by default).
    """
    if not texts:
        return []
    if not settings.openai_api_key:
        logger.error("OPENAI_API_KEY is not set!")
        # Fallback to zeros (for testing if API key is missing)
        return [[0.0] * settings.openai_embedding_dimensions for _ in texts]
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.openai_embedding_model,
        "input": texts,
        "dimensions": settings.openai_embedding_dimensions,
    }
    try:
        # Give it a generous timeout since embeddings can take a few seconds
        with httpx.Client(timeout=30.0) as client:
            response = client.post(settings.openai_api_url, headers=headers, json=payload)
            response.raise_for_status()

            data = response.json()
            # OpenAI returns results in the "data" array
            # Extract the "embedding" float list from each result object
            embeddings = [item["embedding"] for item in data.get("data", [])]
            return embeddings

    except httpx.HTTPError as e:
        logger.error(f"Error calling OpenAI API: {e}")
        if hasattr(e, "response") and e.response is not None:
            logger.error(f"Response body: {e.response.text}")

        # Fallback so pipeline doesn't crash completely, but this is an error
        return [[0.0] * settings.openai_embedding_dimensions for _ in texts]
