import json
import logging
from pathlib import Path

from src.services.llm.openai_chat import chat_complete


# Configure the logging and path to prompts
logger = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).parent / "prompts" / "keyword_extractor_prompt.txt"
PROMPT_TEMPLATE = PROMPT_PATH.read_text()


# Define the main function for extracting the keywords
def extract_keywords(research_goal: str) -> list[str]:
    """
    Extract academic keywords from a research goal using the OpenAI Model
    """

    # Inject the research_goal into the template
    prompt = PROMPT_TEMPLATE.format(research_goal=research_goal)

    # Call the LLM
    response = chat_complete(prompt)

    # Handle the potential errors when calling the api
    if not response:
        logger.error("Failed to extract keywords from LLM.")
        return []

    # Parse the response (strip markdown fences if model wraps output in ```json)
    try:
        cleaned = response.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        keywords = json.loads(cleaned)
        return keywords

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON response: {e}")
        return []