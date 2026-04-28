import uuid
from enum import Enum

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import TimestampMixin, UUIDMixin
from app.db.session import Base


class AnalysisStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Repository(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "repositories"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    github_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    html_url: Mapped[str] = mapped_column(Text, nullable=False)
    clone_url: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(String(100))
    stars: Mapped[int] = mapped_column(Integer, default=0)
    forks: Mapped[int] = mapped_column(Integer, default=0)
    open_issues: Mapped[int] = mapped_column(Integer, default=0)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    is_fork: Mapped[bool] = mapped_column(Boolean, default=False)
    topics: Mapped[list] = mapped_column(JSONB, default=list)

    owner: Mapped["User"] = relationship("User", back_populates="repositories")  # noqa: F821
    analyses: Mapped[list["RepositoryAnalysis"]] = relationship(
        "RepositoryAnalysis", back_populates="repository", cascade="all, delete-orphan"
    )


class RepositoryAnalysis(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "repository_analyses"

    repository_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(50), default=AnalysisStatus.PENDING, nullable=False)
    ai_provider: Mapped[str] = mapped_column(String(50), default="anthropic")
    summary: Mapped[str | None] = mapped_column(Text)
    code_quality_score: Mapped[int | None] = mapped_column(Integer)
    security_score: Mapped[int | None] = mapped_column(Integer)
    maintainability_score: Mapped[int | None] = mapped_column(Integer)
    raw_data: Mapped[dict | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)

    repository: Mapped["Repository"] = relationship("Repository", back_populates="analyses")
    insights: Mapped[list["AnalysisInsight"]] = relationship(  # noqa: F821
        "AnalysisInsight", back_populates="analysis", cascade="all, delete-orphan"
    )
