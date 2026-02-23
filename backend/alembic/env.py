import sys
import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# Alembic runs from the backend/ directory. We need src/ on the path
# so that "from src.models.base import Base" works correctly.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Import all models
# This triggers all model class definitions (User, Project, Paper, and so on)
# and registers them in Base.metadata. Without this import, Alembic
# would generate an empty migration with no CREATE TABLE statements.
from src.models import Base  # noqa: E402 — import after sys.path modification

# Load database URL from settings
from src.config import get_settings  # noqa: E402

settings = get_settings()

# this is the Alembic Config object (alembic.ini values accessible via config)
config = context.config

# Override the sqlalchemy.url in alembic.ini with our computed database URL.
# This means we NEVER hardcode the DB URL in alembic.ini — it always comes
# from settings (which reads from .env).
config.set_main_option("sqlalchemy.url", settings.database_url)

# Interpret the config file for Python logging (if present in alembic.ini).
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# target_metadata tells Alembic about our table definitions.
# Alembic compares the DB state vs. this metadata to detect schema changes.
target_metadata = Base.metadata


# PROBLEM: Airflow shares the same PostgreSQL database (rag_db).
# When Alembic runs --autogenerate, it compares our metadata against ALL tables
# in the DB — including Airflow's ~50 tables. Without a filter it would
# generate DROP TABLE statements for every Airflow table.
#
# SOLUTION: include_object() is called for every table/index/sequence Alembic
# finds. Returning True means "manage this", False means "ignore this".
# We only manage our 10 application tables.
OUR_TABLES = {
    "users",
    "user_preferences",
    "projects",
    "project_topics",
    "papers",
    "project_papers",
    "documents",
    "chat_sessions",
    "chat_messages",
    "sync_events",
}


def include_object(object, name, type_, reflected, compare_to):
    """Filter: only autogenerate for our application tables."""
    if type_ == "table":
        return name in OUR_TABLES
    # For indexes/constraints, follow the table they belong to.
    # object.table.name gives the parent table for indexes.
    if hasattr(object, "table"):
        return object.table.name in OUR_TABLES
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no DB connection needed).
    This generates SQL scripts you can review before applying.
    Useful for production deployments where you want to review SQL first.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,   # only manage OUR_TABLES
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (connects to DB and applies immediately).
    This is what you use in development: alembic upgrade head
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # don't pool connections during migrations
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            include_object=include_object,   # only manage OUR_TABLES
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
