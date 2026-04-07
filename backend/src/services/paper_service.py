import logging
import uuid

from opensearchpy import OpenSearch
from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.project import Project
from src.models.paper import Paper, ProjectPaper
from src.repositories import paper_repo, project_repo
from src.repositories.paper_repo import get_by_arxiv_ids, get_project_papers_by_paper_ids
from src.services.embeddings.openai import get_embeddings
from src.services.opensearch.client import get_opensearch_client
from src.services.opensearch.query_builder import build_hybrid_search_query


# Configure the logging and settings
logger = logging.getLogger(__name__)
settings = get_settings()


# Define a function to search and suggest papers
def search_and_suggest_papers(
    db: Session,
    os_client: OpenSearch,
    project: Project,
    keywords: list[str],
    limit: int = 10,
    topic_id: uuid.UUID | None = None
):
    """
    Search OpenSearch using Hybrid search + RRF, and save suggestions to Postgres.
    """

    logger.info("Searching papers for project: %s with keywords: %s", project.id, keywords)

    vectors = get_embeddings([project.research_goal])
    if not vectors:
        logger.error("Failed to generate embedding for research goal")
        return []
    
    query_vector = vectors[0]

    # Build the OpenSearch query using the keywords and the vector
    query = build_hybrid_search_query(
        query_vector=query_vector,
        keywords=keywords,
        size=limit,
        categories=project.arxiv_categories,  
        year_from=project.year_from,          
        year_to=project.year_to      
    )       

    # Execute search against OpenSearch using the RRF pipeline for hybrid scoring
    try:
        response = os_client.search(
            index=settings.opensearch.index_name,
            body=query,
            params={"search_pipeline": settings.opensearch.rrf_pipeline_name}
        )
    except Exception as e:
        logger.error("OpenSearch query failed: %s", e)
        return []

    # Extract hits
    hits = response.get("hits", {}).get("hits", [])
    if not hits:
        return []

    scores_by_arxiv_id = {h["_source"]["arxiv_id"]: h.get("_score", 0.0) for h in hits}
    sources_by_arxiv_id = {h["_source"]["arxiv_id"]: h["_source"] for h in hits}
    arxiv_ids = list(sources_by_arxiv_id.keys())

    # Batch-fetch existing papers; create missing ones in a single flush
    existing_papers = get_by_arxiv_ids(db, arxiv_ids)
    new_papers: list[Paper] = []
    for arxiv_id, source in sources_by_arxiv_id.items():
        if arxiv_id not in existing_papers:
            p = Paper(
                arxiv_id=arxiv_id,
                title=source["title"],
                abstract=source.get("abstract", ""),
                authors=source.get("authors", []),
                categories=source.get("categories", []),
                published_at=source.get("published_at"),
                pdf_url=f"https://arxiv.org/pdf/{arxiv_id}.pdf",
            )
            db.add(p)
            new_papers.append(p)

    if new_papers:
        db.flush()  # assign IDs without committing

    all_papers: dict[str, Paper] = {**existing_papers}
    for p in new_papers:
        all_papers[p.arxiv_id] = p

    # Batch-fetch existing ProjectPaper links
    paper_ids = [p.id for p in all_papers.values()]
    existing_links = get_project_papers_by_paper_ids(db, project.id, paper_ids)

    # Build new ProjectPaper rows and collect result
    suggested_papers: list[Paper] = []
    for arxiv_id in arxiv_ids:
        paper = all_papers[arxiv_id]
        link = existing_links.get(paper.id)

        if link and link.status in ("accepted", "rejected"):
            continue

        if not link:
            db.add(ProjectPaper(
                project_id=project.id,
                paper_id=paper.id,
                status="suggested",
                relevance_score=scores_by_arxiv_id[arxiv_id],
                added_by="starter_pack",
                topic_id=topic_id,
            ))

        suggested_papers.append(paper)

    db.commit()
    return suggested_papers


def _collect_search_params(db: Session, project: Project) -> tuple[list, list | None, int | None, int | None]:
    """Aggregate keywords, categories, and year ranges from a project and its topics."""
    all_keywords: set[str] = set(project.initial_keywords or [])
    all_categories: set[str] = set(project.arxiv_categories or [])
    year_from_vals: list[int] = [project.year_from] if project.year_from else []
    year_to_vals: list[int] = [project.year_to] if project.year_to else []

    for topic in project_repo.list_topics_by_project(db, project.id):
        all_keywords.update(topic.keywords or [])
        all_categories.update(topic.arxiv_categories or [])
        if topic.year_from:
            year_from_vals.append(topic.year_from)
        if topic.year_to:
            year_to_vals.append(topic.year_to)

    return (
        list(all_keywords),
        list(all_categories) if all_categories else None,
        min(year_from_vals) if year_from_vals else None,
        max(year_to_vals) if year_to_vals else None,
    )


def discover_papers(
    db: Session,
    os_client: OpenSearch,
    project: Project,
    limit: int = 20,
):
    """
    Combined search using project + all active topics' search parameters.
    Deduplicates keywords, unions categories, uses broadest date range.
    """
    if not project.research_goal:
        logger.warning("Project %s has no research_goal — skipping discover", project.id)
        return []

    vectors = get_embeddings([project.research_goal])
    if not vectors:
        logger.error("Failed to generate embedding for research goal")
        return []

    keywords, categories, year_from, year_to = _collect_search_params(db, project)
    query = build_hybrid_search_query(
        query_vector=vectors[0],
        keywords=keywords,
        size=limit,
        categories=categories,
        year_from=year_from,
        year_to=year_to,
    )

    try:
        response = os_client.search(
            index=settings.opensearch.index_name,
            body=query,
            params={"search_pipeline": settings.opensearch.rrf_pipeline_name},
        )
    except Exception as e:
        logger.error("OpenSearch discover query failed: %s", e)
        return []

    hits = response.get("hits", {}).get("hits", [])
    if not hits:
        return []

    scores_by_arxiv_id = {h["_source"]["arxiv_id"]: h.get("_score", 0.0) for h in hits}
    sources_by_arxiv_id = {h["_source"]["arxiv_id"]: h["_source"] for h in hits}
    arxiv_ids = list(sources_by_arxiv_id.keys())

    existing_papers = get_by_arxiv_ids(db, arxiv_ids)
    new_papers: list[Paper] = []
    for arxiv_id, source in sources_by_arxiv_id.items():
        if arxiv_id not in existing_papers:
            p = Paper(
                arxiv_id=arxiv_id,
                title=source["title"],
                abstract=source.get("abstract", ""),
                authors=source.get("authors", []),
                categories=source.get("categories", []),
                published_at=source.get("published_at"),
                pdf_url=f"https://arxiv.org/pdf/{arxiv_id}.pdf",
            )
            db.add(p)
            new_papers.append(p)

    if new_papers:
        db.flush()

    all_papers: dict[str, Paper] = {**existing_papers}
    for p in new_papers:
        all_papers[p.arxiv_id] = p

    paper_ids = [p.id for p in all_papers.values()]
    existing_links = get_project_papers_by_paper_ids(db, project.id, paper_ids)

    suggested_papers: list[Paper] = []
    for arxiv_id in arxiv_ids:
        paper = all_papers[arxiv_id]
        link = existing_links.get(paper.id)

        if link and link.status in ("accepted", "rejected"):
            continue

        if not link:
            db.add(ProjectPaper(
                project_id=project.id,
                paper_id=paper.id,
                status="suggested",
                relevance_score=scores_by_arxiv_id[arxiv_id],
                added_by="discovery",
            ))
        suggested_papers.append(paper)

    db.commit()
    return suggested_papers


def remove_paper_from_project(
    db: Session,
    project: Project,
    paper_id: uuid.UUID,
) -> None:
    """
    Remove a paper from a project: delete OpenSearch chunks, then Postgres row.
    """

    project_paper = paper_repo.get_project_paper(db, project.id, paper_id)
    if not project_paper:
        from src.exceptions import NotFoundError
        raise NotFoundError("Paper", str(paper_id))

    was_accepted = project_paper.status == "accepted"

    # 1. Delete chunks from OpenSearch (paper_id AND project_id match)
    chunk_index = f"{settings.opensearch.index_name}-{settings.opensearch.chunk_index_suffix}"
    try:
        os_client = get_opensearch_client()
        os_client.delete_by_query(
            index=chunk_index,
            body={
                "query": {
                    "bool": {
                        "must": [
                            {"term": {"paper_id": str(paper_id)}},
                            {"term": {"project_id": str(project.id)}},
                        ]
                    }
                }
            },
        )
        os_client.close()
        logger.info("Deleted chunks for paper %s / project %s from OpenSearch", paper_id, project.id)
    except Exception:
        logger.exception("Failed to delete chunks for paper %s from OpenSearch — continuing", paper_id)

    # 2. Delete ProjectPaper row from Postgres
    paper_repo.delete_project_paper(db, project_paper)

    # 3. Decrement paper_count if paper was accepted
    if was_accepted:
        project.paper_count = max(project.paper_count - 1, 0)
        db.commit()