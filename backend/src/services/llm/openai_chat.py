import logging

import httpx
from src.config import get_settings


# Configure the logging and settings
logger = logging.getLogger(__name__)
settings = get_settings()


# Define the chat completion function 
def chat_complete(prompt: str) -> str | None:
    """
    Send a prompt to the configured OpenAI model and returen the text reponse
    """

    # Check for the openai api key first
    if not settings.openai_api_key:
        logger.error("OPENAI_API_KEY is not set!")

        return None
    
    # Define the headers of the request
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }

    # Define the main request body to the OpenAI server
    payload = {
        "model": settings.openai_chat_model,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                    settings.openai_chat_url, 
                    headers=headers, 
                    json=payload)

            response.raise_for_status()
            data = response.json()

            # Extract the text response from the JSON data
            return data.get("choices", [])[0].get("message", {}).get("content", "")

    except httpx.HTTPError as e:
        logger.error(f"Error calling OpenAI API: {e}")
        if hasattr(e, "response") and e.response is not None:
            logger.error(f"Response body: {e.response.text}")
        
        return None