from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import FullTimestampMixin, UUIDMixin
from app.db.session import Base


class User(Base, UUIDMixin, FullTimestampMixin):
    __tablename__ = "users"

    # Core identity
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(Text)

    # Legacy email/password (kept for backward compat)
    username: Mapped[str | None] = mapped_column(String(100), unique=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255))

    # OAuth providers
    google_id: Mapped[str | None] = mapped_column(String(100), unique=True, index=True)
    google_access_token: Mapped[str | None] = mapped_column(Text)

    github_id: Mapped[str | None] = mapped_column(String(100), unique=True, index=True)
    github_access_token: Mapped[str | None] = mapped_column(Text)

    # Flags
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Activity
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    repositories: Mapped[list["Repository"]] = relationship(  # noqa: F821
        "Repository", back_populates="owner", cascade="all, delete-orphan"
    )
    analysis_sessions: Mapped[list["AnalysisSession"]] = relationship(  # noqa: F821
        "AnalysisSession", back_populates="user", cascade="all, delete-orphan"
    )
    chat_messages: Mapped[list["ChatMessage"]] = relationship(  # noqa: F821
        "ChatMessage", back_populates="user", cascade="all, delete-orphan"
    )
