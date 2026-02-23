from sqlalchemy.orm import DeclarativeBase
from datetime import datetime
from sqlalchemy import DateTime, func
from sqlalchemy.orm import mapped_column, MappedColumn


# Base is the single shared registry for all models in this project.
# Every model class inherits from Base so SQLAlchemy + Alembic can see them all.
# It is intentionally empty — DeclarativeBase provides all the functionality.
class Base(DeclarativeBase):
    pass


# TimestampMixin is a reusable mixin (not a table itself) that adds
# created_at and updated_at columns to any model that inherits it.
# Instead of repeating these two columns in every model, we define them once here.

# Usage:
#   class User(Base, TimestampMixin): - User table gets both columns automatically
#       __tablename__ = "users"


class TimestampMixin:
    created_at: MappedColumn[datetime] = mapped_column(
        DateTime(timezone=True),    # TIMESTAMPTZ in PostgreSQL — always store timezone
        server_default=func.now()   # DB sets this to NOW() automatically on INSERT
    )
    updated_at: MappedColumn[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),  # DB sets this on INSERT (same as created_at)
        onupdate=func.now()         # DB updates this to NOW() automatically on every UPDATE
    )