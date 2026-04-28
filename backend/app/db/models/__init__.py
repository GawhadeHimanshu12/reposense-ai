# Import every model here so that:
#  1. SQLAlchemy's mapper registry is fully populated before create_all / Alembic runs.
#  2. Relationship back-references resolve without circular import issues.

from app.db.models.user import User
from app.db.models.repository import Repository, RepositoryAnalysis
from app.db.models.analysis import AnalysisInsight
from app.db.models.analysis_session import AnalysisSession, ChatMessage
from app.db.models.rate_limit import RateLimit
from app.db.models.system_settings import SystemSettings
from app.db.models.audit_log import AuditLog

__all__ = [
    "User",
    "Repository",
    "RepositoryAnalysis",
    "AnalysisInsight",
    "AnalysisSession",
    "ChatMessage",
    "RateLimit",
    "SystemSettings",
    "AuditLog",
]
