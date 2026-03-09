import logging
from opensearchpy import OpenSearch
from src.config import get_settings


# Configure logging and settings
logger = logging.getLogger(__name__)
settings = get_settings()

# Define a function to create the index
def create_arxiv_metadata_index(client: OpenSearch) -> None:
    """Create the arxiv-metadata index for paper discovery."""
    index_name = settings.opensearch.index_name
    
    body = {
        "settings": {
            "index": {
                "knn": True,  # Enable vector search
                "knn.algo_param.ef_search": 100,
            }
        },
        "mappings": {
            "properties": {
                "arxiv_id": {"type": "keyword"},
                "title": {"type": "text"},
                "abstract": {"type": "text"},
                "categories": {"type": "keyword"},
                "published_at": {"type": "date"},
                "abstract_vector": {
                    "type": "knn_vector",
                    "dimension": settings.opensearch.vector_dimension,
                    "method": {
                        "name": "hnsw",
                        "space_type": settings.opensearch.vector_space_type,
                        "engine": "nmslib",
                    },
                },
            }
        },
    }

    if not client.indices.exists(index=index_name):
        client.indices.create(index=index_name, body=body)
        logger.info(f"Created OpenSearch index: {index_name}")
    else:
        logger.info(f"OpenSearch index already exists: {index_name}")


def create_arxiv_chunks_index(client: OpenSearch) -> None:
    """Create the arxiv-chunks index for RAG."""
    index_name = f"{settings.opensearch.index_name}-{settings.opensearch.chunk_index_suffix}"
    
    body = {
        "settings": {
            "index": {
                "knn": True,
                "knn.algo_param.ef_search": 100,
            }
        },
        "mappings": {
            "properties": {
                "chunk_text": {"type": "text"},
                "paper_id": {"type": "keyword"},
                "document_id": {"type": "keyword"},
                "project_id": {"type": "keyword"},
                "arxiv_id": {"type": "keyword"},
                "title": {"type": "keyword"},
                "chunk_vector": {
                    "type": "knn_vector",
                    "dimension": settings.opensearch.vector_dimension,
                    "method": {
                        "name": "hnsw",
                        "space_type": settings.opensearch.vector_space_type,
                        "engine": "nmslib",
                    },
                },
            }
        },
    }

    if not client.indices.exists(index=index_name):
        client.indices.create(index=index_name, body=body)
        logger.info(f"Created OpenSearch index: {index_name}")
    else:
        logger.info(f"OpenSearch index already exists: {index_name}")


def setup_rrf_pipeline(client: OpenSearch) -> None:
    """Register the Reciprocal Rank Fusion (RRF) pipeline."""
    pipeline_name = settings.opensearch.rrf_pipeline_name
    
    body = {
        "description": "Post-processor for hybrid search using RRF",
        "phase_results_processors": [
            {
                "normalization-processor": {
                    "normalization": {"technique": "min_max"},
                    "combination": {
                        "technique": "rrf",
                        "parameters": {"weights": [0.5, 0.5]},
                    },
                }
            }
        ],
    }
    
    try:
        client.transport.perform_request(
            "PUT", f"/_search/pipeline/{pipeline_name}", body=body
        )
        logger.info(f"Created OpenSearch RRF pipeline: {pipeline_name}")
    except Exception as e:
        logger.error(f"Failed to create RRF pipeline: {e}")


def setup_indices(client: OpenSearch) -> None:
    """Initialize all indices and pipelines required."""
    create_arxiv_metadata_index(client)
    create_arxiv_chunks_index(client)
    setup_rrf_pipeline(client)

    
if __name__ == "__main__":
    from src.services.opensearch.client import get_opensearch_client
    logging.basicConfig(level=logging.INFO)
    os_client = get_opensearch_client()
    setup_indices(os_client)