import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import TimestampMixin, UUIDMixin
from app.db.session import Base


class SessionStatus(str, Enum):
    PENDING = "pending"
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    FAILED = "failed"


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


class AnalysisSession(Base, UUIDMixin, TimestampMixin):
    """One AI analysis run for a GitHub repository URL."""

    __tablename__ = "analysis_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Repository identification
    repo_url: Mapped[str] = mapped_column(Text, nullable=False)
    repo_name: Mapped[str] = mapped_column(String(500), nullable=False, index=True)

    # Raw GitHub API payload cached here
    repo_data: Mapped[dict | None] = mapped_column(JSONB)

    # Full AI analysis result (scores, insights, summary, …)
    analysis_result: Mapped[dict | None] = mapped_column(JSONB)

    # Which AI provider produced this analysis
    ai_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="anthropic")

    # Lifecycle
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=SessionStatus.PENDING
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="analysis_sessions")  # noqa: F821
    chat_messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base, UUIDMixin, TimestampMixin):
    """A single turn in the follow-up chat for an analysis session."""

    __tablename__ = "chat_messages"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("analysis_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Denormalized for direct user→messages queries
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tokens_used: Mapped[int | None] = mapped_column(Integer)

    # Relationships
    session: Mapped["AnalysisSession"] = relationship(
        "AnalysisSession", back_populates="chat_messages"
    )
    user: Mapped["User"] = relationship("User", back_populates="chat_messages")  # noqa: F821
