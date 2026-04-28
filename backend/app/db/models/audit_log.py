import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import TimestampMixin, UUIDMixin
from app.db.session import Base


class AuditLog(Base, UUIDMixin, TimestampMixin):
    """Immutable record of every admin action."""

    __tablename__ = "audit_logs"

    admin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(50))   # "user" | "provider" | "settings" …
    target_id: Mapped[str | None] = mapped_column(String(255))
    details: Mapped[dict | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(64))

    admin: Mapped["User | None"] = relationship("User", foreign_keys=[admin_id])  # noqa: F821
