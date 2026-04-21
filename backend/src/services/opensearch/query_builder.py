from src.config import get_settings

# Configure the settings
settings = get_settings()


def build_chunk_search_query(
    query_text: str,
    query_vector: list[float],
    paper_ids: list[str] | None = None,
    project_id: str | None = None,
    size: int = 8,
) -> dict:
    """Build a hybrid BM25 + k-NN query for the chunks index.

    Paper chunks are paper-scoped (shared across projects) — filtered by paper_ids.
    Document chunks are project-scoped — filtered by project_id.
    A should clause combines both so either type of chunk is returned.
    """

    should_clauses = []
    if paper_ids:
        should_clauses.append({"terms": {"paper_id": paper_ids}})
    if project_id:
        # Only match uploaded-document chunks (no paper_id field) scoped to this project.
        # Paper chunks also carry project_id, but must be filtered by paper_id only
        # to avoid returning chunks from rejected papers.
        # Match uploaded-document chunks: project-scoped and paper_id is absent or empty.
        # Must use regexp instead of exists because document chunks carry paper_id: ""
        # (empty string), and the exists query returns true for empty strings.
        should_clauses.append({
            "bool": {
                "filter": [{"term": {"project_id": project_id}}],
                "must_not": [{"regexp": {"paper_id": ".+"}}],
            }
        })

    filter_clause = (
        [{"bool": {"should": should_clauses, "minimum_should_match": 1}}]
        if should_clauses
        else []
    )

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
    query_vector: list[float] | None,
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

    if not query_vector:
        # If no vector is provided, just return the BM25 query
        return {
            "size": size,
            "query": bm25_query
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
