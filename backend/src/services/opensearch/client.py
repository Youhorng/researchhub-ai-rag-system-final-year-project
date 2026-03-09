import logging
from typing import Generator
from opensearchpy import OpenSearch
from src.config import get_settings


# Configure the logging
logger = logging.getLogger(__name__)

# Get the settings
settings = get_settings()

# Create the OpenSearch Client
def get_opensearch_client() -> OpenSearch:
    """Create and return a configured OpenSearch client."""
    client = OpenSearch(
        hosts=[settings.opensearch_host],
        http_auth=(settings.opensearch_user, settings.opensearch_password),
        use_ssl=False,
        verify_certs=False,
        ssl_assert_hostname=False,
        ssl_show_warn=False,
    )
    return client


def get_os_client() -> Generator[OpenSearch, None, None]:
    """Dependency injector for FastAPI endpoints."""
    client = get_opensearch_client()
    try:
        yield client
    finally:
        client.close()
