from src.config import get_settings

# Configure the settings
settings = get_settings()


def build_chunk_search_query(
    query_text: str,
    query_vector: list[float],
    project_id: str,
    size: int = 8,
) -> dict:
    """Build a hybrid BM25 + k-NN query for the chunks index, scoped to a project."""

    filter_clause = [{"term": {"project_id": project_id}}]

    bm25_query = {
        "bool": {
            "must": [
                {"match": {"chunk_text": {"query": query_text}}}
            ],
            "filter": filter_clause,
        }
    }

    knn_query = {
        "script_score": {
            "query": {
                "bool": {
                    "filter": filter_clause,
                }
            },
            "script": {
                "source": "knn_score",
                "lang": "knn",
                "params": {
                    "field": "chunk_vector",
                    "query_value": query_vector,
                    "space_type": settings.opensearch.vector_space_type,
                },
            },
        }
    }

    return {
        "size": size,
        "query": {
            "hybrid": {
                "queries": [bm25_query, knn_query]
            }
        },
    }


# Define a function to build the hybrid search query
def build_hybrid_search_query(
    query_vector: list[float],
    keywords: list[str],
    size: int = 10,
    categories: list[str] | None = None,
    year_from: int | None = None,
    year_to: int | None = None
) -> dict:

    """
    Build a hybrid BM25 + k-NN OpenSearch query for paper discovery.
    Uses the Neural Search plugin's hybrid query with RRF pipeline
    to combine lexical (BM25) and semantic (KNN) results.
    """

    # The BM25 Part (Keyword Match)
    keyword_string = " ".join(keywords)

    # Add category and date range filters
    filter_clause = []
    if categories:
        filter_clause.append({"terms": {"categories": categories}})

    if year_from or year_to:
        date_range = {}
        if year_from:
            date_range["gte"] = f"{year_from}-01-01"
        if year_to:
            date_range["lte"] = f"{year_to}-12-31"
        filter_clause.append({"range": {"published_at": date_range}})

    # BM25 lexical sub-query
    # 'title^2' means finding the keyword in the title is weighted 2x heavier
    bm25_query = {
        "bool": {
            "must": [
                {
                    "multi_match": {
                        "query": keyword_string,
                        "fields": ["title^2", "abstract"]
                    }
                }
            ],
            "filter": filter_clause
        }
    }

    # KNN semantic sub-query using script_score (brute-force cosine similarity).
    # This avoids loading the full HNSW graph into native memory, which can
    # crash OpenSearch with large indices (673k+ docs x 1024-dim).
    knn_query = {
        "script_score": {
            "query": {
                "bool": {
                    "filter": filter_clause if filter_clause else [{"match_all": {}}]
                }
            },
            "script": {
                "source": "knn_score",
                "lang": "knn",
                "params": {
                    "field": "abstract_vector",
                    "query_value": query_vector,
                    "space_type": settings.opensearch.vector_space_type,
                },
            },
        }
    }

    # Hybrid query combining BM25 + KNN, scored by RRF pipeline
    query = {
        "size": size,
        "query": {
            "hybrid": {
                "queries": [
                    bm25_query,
                    knn_query
                ]
            }
        }
    }

    return query
