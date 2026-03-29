import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from opensearchpy import OpenSearch
from pydantic import BaseModel

from src.config import get_settings
from src.services.opensearch.client import get_os_client
from src.services.opensearch.query_builder import build_hybrid_search_query

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(
    prefix="/api/v1/explore",
    tags=["explore"],
)

class ExploreSearchResponseHit(BaseModel):
    paper_id: str
    arxiv_id: str
    title: str
    abstract: str
    categories: list[str]
    published_at: str
    relevance_score: float

class ExploreSearchResponse(BaseModel):
    query: str
    total: int
    page: int
    hits: list[ExploreSearchResponseHit]

@router.get("/search", response_model=ExploreSearchResponse)
async def explore_search(
    q: str = Query(..., description="The search query"),
    categories: Optional[List[str]] = Query(None, description="Optional list of categories to filter by"),
    year_from: Optional[int] = Query(None, description="Start year"),
    year_to: Optional[int] = Query(None, description="End year"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Results per page"),
    os_client: OpenSearch = Depends(get_os_client),
):
    """Run global hybrid BM25 + KNN search against the full arXiv index."""
    
    # Embed the query is skipped for global explore because exact script_score over 702k records takes too long.
    query_vector = None

    # Build the BM25 query
    query = build_hybrid_search_query(
        query_vector=query_vector,
        keywords=q.split(),
        size=limit,
        categories=categories,
        year_from=year_from,
        year_to=year_to
    )
    
    # Add pagination logic to OpenSearch query
    query["from"] = (page - 1) * limit
    
    try:
        response = os_client.search(
            index=settings.opensearch.index_name,
            body=query,
        )
    except Exception as e:
        logger.exception("OpenSearch explore search failed")
        raise HTTPException(status_code=502, detail="Search service unavailable")
        
    hits = []
    # OpenSearch returns total as dict {"value": N, "relation": "eq"} or int
    total = 0
    total_obj = response.get("hits", {}).get("total", {})
    if isinstance(total_obj, dict):
        total = total_obj.get("value", 0)
    else:
        total = total_obj
    
    for hit in response.get("hits", {}).get("hits", []):
        source = hit.get("_source", {})
        hits.append(
            ExploreSearchResponseHit(
                paper_id=source.get("id", ""),
                arxiv_id=source.get("arxiv_id", ""),
                title=source.get("title", ""),
                abstract=source.get("abstract", ""),
                categories=source.get("categories", []),
                published_at=str(source.get("published_at", "")),
                relevance_score=hit.get("_score", 0.0),
            )
        )
        
    return ExploreSearchResponse(
        query=q,
        total=total,
        page=page,
        hits=hits
    )
