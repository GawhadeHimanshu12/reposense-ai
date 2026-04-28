"""Initial schema — all tables.

Revision ID: 0001
Revises:
Create Date: 2026-04-27 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Extensions ────────────────────────────────────────────────────────
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm"')

    # ── users ─────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("avatar_url", sa.Text, nullable=True),
        # legacy email/password
        sa.Column("username", sa.String(100), nullable=True),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        # Google
        sa.Column("google_id", sa.String(100), nullable=True),
        sa.Column("google_access_token", sa.Text, nullable=True),
        # GitHub
        sa.Column("github_id", sa.String(100), nullable=True),
        sa.Column("github_access_token", sa.Text, nullable=True),
        # Flags
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("is_verified", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_admin", sa.Boolean, nullable=False, server_default=sa.false()),
        # Timestamps
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)
    op.create_index("ix_users_github_id", "users", ["github_id"], unique=True)

    # ── repositories ──────────────────────────────────────────────────────
    op.create_table(
        "repositories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("github_id", sa.BigInteger, nullable=True),
        sa.Column("full_name", sa.String(500), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("html_url", sa.Text, nullable=False),
        sa.Column("clone_url", sa.Text, nullable=True),
        sa.Column("language", sa.String(100), nullable=True),
        sa.Column("stars", sa.Integer, nullable=False, server_default="0"),
        sa.Column("forks", sa.Integer, nullable=False, server_default="0"),
        sa.Column("open_issues", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_private", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_fork", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("topics", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_repositories_owner_id", "repositories", ["owner_id"])
    op.create_index("ix_repositories_github_id", "repositories", ["github_id"], unique=True)
    op.create_index("ix_repositories_full_name", "repositories", ["full_name"])

    # ── repository_analyses ────────────────────────────────────────────────
    op.create_table(
        "repository_analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("repository_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("ai_provider", sa.String(50), nullable=False, server_default="anthropic"),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("code_quality_score", sa.Integer, nullable=True),
        sa.Column("security_score", sa.Integer, nullable=True),
        sa.Column("maintainability_score", sa.Integer, nullable=True),
        sa.Column("raw_data", postgresql.JSONB, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_repository_analyses_repository_id", "repository_analyses", ["repository_id"]
    )

    # ── analysis_insights ─────────────────────────────────────────────────
    op.create_table(
        "analysis_insights",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("analysis_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("severity", sa.String(50), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("file_path", sa.Text, nullable=True),
        sa.Column("line_number", sa.Integer, nullable=True),
        sa.Column("extra_data", postgresql.JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["analysis_id"], ["repository_analyses.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_analysis_insights_analysis_id", "analysis_insights", ["analysis_id"])

    # ── analysis_sessions ─────────────────────────────────────────────────
    op.create_table(
        "analysis_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("repo_url", sa.Text, nullable=False),
        sa.Column("repo_name", sa.String(500), nullable=False),
        sa.Column("repo_data", postgresql.JSONB, nullable=True),
        sa.Column("analysis_result", postgresql.JSONB, nullable=True),
        sa.Column("ai_provider", sa.String(50), nullable=False, server_default="anthropic"),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_analysis_sessions_user_id", "analysis_sessions", ["user_id"])
    op.create_index("ix_analysis_sessions_repo_name", "analysis_sessions", ["repo_name"])

    # ── chat_messages ─────────────────────────────────────────────────────
    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("tokens_used", sa.Integer, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["session_id"], ["analysis_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])
    op.create_index("ix_chat_messages_user_id", "chat_messages", ["user_id"])

    # ── rate_limits ───────────────────────────────────────────────────────
    op.create_table(
        "rate_limits",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, primary_key=True),
        sa.Column("action_type", sa.String(100), nullable=False, primary_key=True),
        sa.Column("count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # ── system_settings ───────────────────────────────────────────────────
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(255), primary_key=True, nullable=False),
        sa.Column("value", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_system_settings_updated_by", "system_settings", ["updated_by"])

    # ── Seed default system settings ──────────────────────────────────────
    op.execute(
        """
        INSERT INTO system_settings (key, value) VALUES
          ('rate_limits', '{"repo_analysis_per_day": 10, "followup_per_day": 50, "general_per_minute": 60}'),
          ('feature_flags', '{"google_oauth": true, "github_oauth": true, "gemini_provider": false}'),
          ('ai_defaults', '{"provider": "anthropic", "model": "claude-sonnet-4-6"}')
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_table("rate_limits")
    op.drop_table("chat_messages")
    op.drop_table("analysis_sessions")
    op.drop_table("analysis_insights")
    op.drop_table("repository_analyses")
    op.drop_table("repositories")
    op.drop_table("users")
