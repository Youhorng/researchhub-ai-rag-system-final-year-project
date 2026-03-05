# Import all models here so that Alembic's env.py can discover them
# when it calls Base.metadata to generate migrations.
#
# Without these imports, Alembic cannot see the tables and will generate
# empty migration files (no CREATE TABLE statements).
#
# Order matters for relationships — import models before those that reference them.
from src.models.base import Base, TimestampMixin
from src.models.user import User, UserPreferences
from src.models.project import Project, ProjectTopic, SyncEvent
from src.models.paper import Paper, ProjectPaper
from src.models.document import Document
from src.models.chat import ChatSession, ChatMessage

__all__ = [
    "Base",
    "TimestampMixin",
    "User",
    "UserPreferences",
    "Project",
    "ProjectTopic",
    "Paper",
    "ProjectPaper",
    "Document",
    "ChatSession",
    "ChatMessage",
    "SyncEvent",
]
