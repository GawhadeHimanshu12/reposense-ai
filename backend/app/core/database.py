"""
Convenience re-export of the database session machinery.

Other modules can import from either `app.db.session` (authoritative) or
`app.core.database` (matches the layout requested in the project spec).
"""

from app.db.session import AsyncSessionLocal, Base, engine  # noqa: F401

__all__ = ["engine", "Base", "AsyncSessionLocal"]
