import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class SystemSettings(Base):
    """
    Key-value admin configuration store.

    `key` is the primary key (e.g. "rate_limits", "feature_flags").
    `value` is an arbitrary JSONB payload so the schema never needs to
    change when new settings are introduced.
    """

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(255), primary_key=True, nullable=False)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    editor: Mapped["User | None"] = relationship("User")  # noqa: F821
