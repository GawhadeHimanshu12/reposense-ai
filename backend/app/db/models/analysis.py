import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import TimestampMixin, UUIDMixin
from app.db.session import Base


class AnalysisInsight(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "analysis_insights"

    analysis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("repository_analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(50), nullable=False)  # info, warning, critical
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    file_path: Mapped[str | None] = mapped_column(Text)
    line_number: Mapped[int | None] = mapped_column()
    extra_data: Mapped[dict | None] = mapped_column(JSONB)

    analysis: Mapped["RepositoryAnalysis"] = relationship(  # noqa: F821
        "RepositoryAnalysis", back_populates="insights"
    )
