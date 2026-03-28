from sqlalchemy.orm import Session
from src.models.paper import Paper, ProjectPaper


# Define a function to get paper from opensearch
def get_or_create(db: Session, arxiv_data: dict) -> Paper:
    """Get an existing paper by arxiv_id or create a new one."""
    
    # Check if the paper is already in our Postgres database
    existing_paper = db.query(Paper).filter(Paper.arxiv_id == arxiv_data["arxiv_id"]).first()
    if existing_paper:
        return existing_paper
        
    # If not, create a new one from the OpenSearch hit data
    new_paper = Paper(
        arxiv_id=arxiv_data["arxiv_id"],
        title=arxiv_data["title"],
        abstract=arxiv_data.get("abstract", ""),
        authors=arxiv_data.get("authors", []), 
        categories=arxiv_data.get("categories", []),
        published_at=arxiv_data.get("published_at"),
        pdf_url=f"https://arxiv.org/pdf/{arxiv_data['arxiv_id']}.pdf"
    )
    db.add(new_paper)
    db.commit()
    db.refresh(new_paper)
    
    return new_paper


def get_project_paper(db: Session, project_id, paper_id) -> ProjectPaper | None:
    return db.query(ProjectPaper).filter_by(
        project_id=project_id,
        paper_id=paper_id,
    ).first()


def delete_project_paper(db: Session, project_paper: ProjectPaper) -> None:
    db.delete(project_paper)
    db.commit()