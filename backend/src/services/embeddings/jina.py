import logging
import httpx
from src.config import get_settings


# Configure logging and settings
logger = logging.getLogger(__name__)
settings = get_settings()

JINA_API_URL = "https://api.jina.ai/v1/embeddings"


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Call Jina AI API to get embeddings for a list of texts.
    Returns a list of vectors (each 1024-dimensional by default).
    """
    if not texts:
        return []
    if not settings.jina_api_key:
        logger.error("JINA_API_KEY is not set!")
        # Fallback to zeros (for testing if API key is missing)
        return [[0.0] * settings.jina_embedding_dimensions for _ in texts]
    headers = {
        "Authorization": f"Bearer {settings.jina_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.jina_embedding_model,
        "normalized": True,
        "embedding_type": "float",
        "input": texts,
    }
    try:
        # Give it a generous timeout since embeddings can take a few seconds
        with httpx.Client(timeout=30.0) as client:
            response = client.post(JINA_API_URL, headers=headers, json=payload)
            response.raise_for_status()
            
            data = response.json()
            # Jina returns results in the "data" array
            # Extract the "embedding" float list from each result object
            embeddings = [item["embedding"] for item in data.get("data", [])]
            return embeddings
            
    except httpx.HTTPError as e:
        logger.error(f"Error calling Jina AI API: {e}")
        if hasattr(e, "response") and e.response is not None:
            logger.error(f"Response body: {e.response.text}")
            
        # Fallback so pipeline doesn't crash completely, but this is an error
        return [[0.0] * settings.jina_embedding_dimensions for _ in texts]
