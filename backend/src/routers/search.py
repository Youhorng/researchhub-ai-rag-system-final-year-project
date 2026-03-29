import logging
import uuid

from fastapi import APIRouter, HTTPException
from src.config import get_settings
from src.dependencies import CurrentUser, DbSession, OsClient
from src.models.project import Project
from src.schemas.search import ChunkSearchHit, ChunkSearchRequest, ChunkSearchResponse
from src.services.embeddings.openai import get_embeddings
from src.services.opensearch.query_builder import build_chunk_search_query

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(
    prefix="/api/v1/projects/{project_id}/search",
    tags=["search"],
)


@router.post(
    "",
    response_model=ChunkSearchResponse,
    responses={
        404: {"description": "Project not found"},
        502: {"description": "Search service unavailable"},
    },
)
async def search_chunks(
    project_id: uuid.UUID,
    body: ChunkSearchRequest,
    db: DbSession,
    current_user: CurrentUser,
    os_client: OsClient,
):
    """Run hybrid BM25 + KNN search against project chunks."""
    project = db.query(Project).filter_by(id=project_id, owner_id=current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Embed the query
    vectors = get_embeddings([body.query])
    query_vector = vectors[0]

    # Build and execute hybrid search
    chunk_index = f"{settings.opensearch.index_name}-{settings.opensearch.chunk_index_suffix}"
    query = build_chunk_search_query(
        query_text=body.query,
        query_vector=query_vector,
        project_id=str(project_id),
        size=body.top_k,
    )

    try:
        response = os_client.search(
            index=chunk_index,
            body=query,
            params={"search_pipeline": settings.opensearch.rrf_pipeline_name},
        )
    except Exception:
        logger.exception("OpenSearch chunk search failed")
        raise HTTPException(status_code=502, detail="Search service unavailable")

    hits = []
    for hit in response.get("hits", {}).get("hits", []):
        source = hit["_source"]
        hits.append(
            ChunkSearchHit(
                paper_id=source.get("paper_id", ""),
                arxiv_id=source.get("arxiv_id", ""),
                title=source.get("title", ""),
                chunk_text=source.get("chunk_text", ""),
                relevance_score=hit.get("_score", 0.0),
            )
        )

    return ChunkSearchResponse(
        query=body.query,
        hits=hits,
        total=len(hits),
    )
