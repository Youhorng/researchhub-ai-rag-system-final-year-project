import logging

import src.repositories.project_repo as project_repo
from sqlalchemy.orm import Session
from src.exceptions import ForbiddenError, NotFoundError
from src.models.project import Project, ProjectTopic
from src.models.user import User
from src.schemas.project import ProjectCreate, ProjectUpdate, TopicCreate, TopicUpdate

# Configure the logging
logger = logging.getLogger(__name__)


# Main project operations
def create_project(db: Session, current_user: User, data: ProjectCreate) -> Project:
    project = project_repo.create(
        db=db,
        owner_id=current_user.id,
        name=data.name,
        description=data.description,
        research_goal=data.research_goal,
        arxiv_categories=data.arxiv_categories,
        initial_keywords=data.initial_keywords,
        year_from=data.year_from,
        year_to=data.year_to,
    )
    logger.info("Created project %s for user %s", project.id, current_user.clerk_id)
    return project


def list_projects(
    db: Session, current_user: User, include_archived: bool = False
) -> list[Project]:
    return project_repo.list_by_owner(
        db=db, owner_id=current_user.id, include_archived=include_archived
    )


def get_project(db: Session, current_user: User, project_id) -> Project:
    project = project_repo.get_by_id(db, project_id)
    if not project:
        raise NotFoundError("Project", str(project_id))
    if project.owner_id != current_user.id:
        raise ForbiddenError("Not your project")
    return project


def update_project(
    db: Session, current_user: User, project_id, data: ProjectUpdate
) -> Project:
    project = get_project(db, current_user, project_id)  # reuse — handles 404 + 403
    updates = data.model_dump(exclude_unset=True)         # only fields the caller sent
    return project_repo.update(db, project, **updates)


def delete_project(db: Session, current_user: User, project_id) -> None:
    project = get_project(db, current_user, project_id)
    project_repo.delete(db, project)
    logger.info("Deleted project %s", project_id)


# Main topic operations
def add_topic(
    db: Session, current_user: User, project_id, data: TopicCreate
) -> ProjectTopic:
    get_project(db, current_user, project_id)  # ownership check
    topic = project_repo.create_topic(
        db=db,
        project_id=project_id,
        name=data.name,
        arxiv_categories=data.arxiv_categories,
        keywords=data.keywords,
        year_from=data.year_from,
        year_to=data.year_to,
    )
    logger.info("Added topic %s to project %s", topic.id, project_id)
    return topic

    
def list_topics(
    db: Session, current_user: User, project_id
) -> list[ProjectTopic]:
    get_project(db, current_user, project_id)  # ownership check
    return project_repo.list_topics_by_project(db, project_id)


def get_topic(
    db: Session, current_user: User, project_id, topic_id
) -> ProjectTopic:
    get_project(db, current_user, project_id)  # ownership check
    topic = project_repo.get_topic_by_id(db, topic_id)
    if not topic or topic.project_id != project_id or topic.status == "pruned":
        raise NotFoundError("Topic", str(topic_id))
    return topic


def update_topic(
    db: Session, current_user: User, project_id, topic_id, data: TopicUpdate
) -> ProjectTopic:
    topic = get_topic(db, current_user, project_id, topic_id)
    updates = data.model_dump(exclude_unset=True)
    return project_repo.update_topic(db, topic, **updates)


def delete_topic(
    db: Session, current_user: User, project_id, topic_id
) -> None:
    topic = get_topic(db, current_user, project_id, topic_id)
    project_repo.prune_topic(db, topic)
    logger.info("Pruned topic %s from project %s", topic_id, project_id)