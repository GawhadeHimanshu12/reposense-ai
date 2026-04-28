import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class RateLimit(Base):
    """
    DB-backed per-user, per-action rate limit window.

    Composite primary key (user_id, action_type) — one row per user per
    action type.  The application increments `count` within the current
    `window_start` minute and resets when the window expires.
    """

    __tablename__ = "rate_limits"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    action_type: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        nullable=False,
    )
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
