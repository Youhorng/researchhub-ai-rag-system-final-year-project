import logging
from opensearchpy import OpenSearch
from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.project import Project
from src.models.paper import Paper, ProjectPaper
from src.repositories import paper_repo
from src.services.embeddings.openai import get_embeddings
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
    limit: int = 10
):
    """
    Search OpenSearch using Hybrid search + RRF, and save suggestions to Postgres.
    """

    logger.info(f"Searching papers for project: {project.id} with keywords: {keywords}")
    
    # Embed the research goal
    vectors = get_embeddings([project.research_goal])
    if not vectors or len(vectors) == 0:
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
        logger.error(f"OpenSearch query failed: {e}")
        return []

    # Extract the hits and save to Postgres
    suggested_papers = []
    hits = response.get("hits", {}).get("hits", [])
    
    for hit in hits:
        source = hit["_source"]
        relevance_score = hit.get("_score", 0.0)
        
        # Save (or retrieve) the paper globally in Postgres
        paper = paper_repo.get_or_create(db, source)
        
        # Link this paper to the current project (if not already linked)
        existing_link = db.query(ProjectPaper).filter_by(
            project_id=project.id,
            paper_id=paper.id
        ).first()
        
        if not existing_link:
            project_paper = ProjectPaper(
                project_id=project.id,
                paper_id=paper.id,
                status="suggested",
                relevance_score=relevance_score,
                added_by="starter_pack"
            )
            db.add(project_paper)
        
        suggested_papers.append(paper)

    db.commit()
        
    return suggested_papers