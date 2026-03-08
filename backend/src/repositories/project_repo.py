import logging
from sqlalchemy.orm import Session
from src.models.project import Project, ProjectTopic


# Configure the logging
logger = logging.getLogger(__name__)


# Define all the project queries
def create(db: Session, owner_id, name: str,
           description: str | None = None,
           research_goal: str | None = None,
           arxiv_categories: list[str] | None = None,
           initial_keywords: list[str] | None = None,
           year_from: int | None = None,
           year_to: int | None = None) -> Project:

    # Define the main project query
    project = Project(
        owner_id=owner_id,
        name=name,
        description=description,
        research_goal=research_goal,
        arxiv_categories=arxiv_categories,
        initial_keywords=initial_keywords,
        year_from=year_from,
        year_to=year_to,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    return project    
        

def get_by_id(db: Session, project_id) -> Project | None:
    return db.query(Project).filter(Project.id == project_id).first()


def list_by_owner(
    db: Session, owner_id, include_archived: bool = False
) -> list[Project]:
    query = db.query(Project).filter(Project.owner_id == owner_id)
    if not include_archived:
        query = query.filter(Project.status == "active")
    return query.order_by(Project.created_at.desc()).all()


def update(db: Session, project: Project, **fields) -> Project:
    for key, value in fields.items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return project


def delete(db: Session, project: Project) -> None:
    db.delete(project)
    db.commit()


def increment_paper_count(db: Session, project_id, delta: int = 1) -> None:
    project = get_by_id(db, project_id)
    if project:
        project.paper_count += delta
        db.commit()


def increment_document_count(db: Session, project_id, delta: int = 1) -> None:
    project = get_by_id(db, project_id)
    if project:
        project.document_count += delta
        db.commit()



# Define all the topic queries
def create_topic(
    db: Session,
    project_id,
    name: str,
    arxiv_categories: list[str] | None = None,
    keywords: list[str] | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
) -> ProjectTopic:

    topic = ProjectTopic(
        project_id=project_id,
        name=name,
        arxiv_categories=arxiv_categories,
        keywords=keywords,
        year_from=year_from,
        year_to=year_to,
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


def get_topic_by_id(db: Session, topic_id) -> ProjectTopic | None:
    return db.query(ProjectTopic).filter(ProjectTopic.id == topic_id).first()


def list_topics_by_project(db: Session, project_id) -> list[ProjectTopic]:
    return (
        db.query(ProjectTopic)
        .filter(
            ProjectTopic.project_id == project_id,
            ProjectTopic.status == "active",
        )
        .order_by(ProjectTopic.added_at.desc())
        .all()
    )