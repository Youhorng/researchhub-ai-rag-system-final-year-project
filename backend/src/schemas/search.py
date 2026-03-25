from pydantic import BaseModel, Field


class ChunkSearchRequest(BaseModel):
    query: str
    top_k: int = Field(8, ge=1, le=50)


class ChunkSearchHit(BaseModel):
    paper_id: str
    arxiv_id: str
    title: str
    chunk_text: str
    relevance_score: float


class ChunkSearchResponse(BaseModel):
    query: str
    hits: list[ChunkSearchHit]
    total: int
