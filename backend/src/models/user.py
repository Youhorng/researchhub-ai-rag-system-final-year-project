import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.models.base import Base, TimestampMixin


# Represents a person who signs in via Clerk.
# We do NOT store passwords — Clerk handles all authentication.
# On first login, FastAPI reads the Clerk JWT and upserts a row here.
class User(Base, TimestampMixin):
    __tablename__ = "users"

    # Primary key — a random UUID generated in Python (not by the DB).
    # Using UUID instead of integer IDs avoids exposing sequential IDs in URLs.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # clerk_id is the unique identifier Clerk puts in every JWT as the "sub" claim.
    # This is how we link a Clerk user to our own users table.
    # index=True speeds up the lookup we do on every authenticated request.
    clerk_id: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )

    # Email and display_name are copied from the Clerk JWT payload on first login.
    # nullable=True so multiple users can exist before their email claim is populated.
    # PostgreSQL allows multiple NULLs in a unique column.
    email: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # URL to the user's profile picture (provided by Clerk / OAuth provider).
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    # 1-to-1: each user has exactly one preferences record.
    # uselist=False tells SQLAlchemy this is a single object, not a list.
    # cascade="all, delete-orphan" means if a User is deleted,
    # their UserPreferences row is automatically deleted too.
    preferences: Mapped["UserPreferences"] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    # 1-to-many: a user can own many projects.
    # cascade="all, delete-orphan" means deleting a user deletes all their projects.
    projects: Mapped[list["Project"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
    )


# Stores per-user settings: theme, default model, notification preferences.
# Kept in a separate table so the users table stays lean and easy to query.
# This is a 1-to-1 with users — one user, one preferences row.
class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # ForeignKey links this row to its owner in the users table.
    # unique=True enforces the 1-to-1 relationship at the database level —
    # PostgreSQL will reject a second preferences row for the same user_id.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), unique=True, nullable=False
    )

    # UI theme preference. Defaults to "system" (follow OS dark/light setting).
    theme: Mapped[str] = mapped_column(String(50), nullable=False, default="system")

    # The LLM model the user prefers for chat ("llama3.2:1b", "llama3.2:3b").
    # nullable — if None, the app falls back to the global default in config.py.
    default_llm_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Whether the user wants email notifications for sync events / new papers.
    email_notifications: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # Only tracks the last update time — no created_at needed here.
    # We don't inherit TimestampMixin because we only need updated_at.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),  # set on first INSERT
        onupdate=func.now(),        # auto-updated on every UPDATE
    )

    # Back-reference to the User who owns this preferences row.
    user: Mapped["User"] = relationship(back_populates="preferences")
