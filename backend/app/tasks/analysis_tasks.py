"""
Celery tasks for async repository analysis.
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import structlog

from app.tasks.celery_app import celery_app

logger = structlog.get_logger()


def _run(coro):
    """Run a coroutine from a sync Celery worker."""
    return asyncio.run(coro)


@celery_app.task(
    bind=True,
    name="analysis.analyze_repository",
    max_retries=2,
    default_retry_delay=10,
    soft_time_limit=180,
    time_limit=240,
)
def analyze_repository_task(
    self,
    session_id: str,
    user_id: str,
    repo_url: str,
    preferred_provider: str = "anthropic",
) -> dict[str, Any]:
    """
    Fetch GitHub data, run AI analysis, persist results to DB.

    Lifecycle:
      pending → analyzing → completed | failed
    """
    return _run(
        _analyze_repository_async(
            task=self,
            session_id=session_id,
            user_id=user_id,
            repo_url=repo_url,
            preferred_provider=preferred_provider,
        )
    )


async def _analyze_repository_async(
    task,
    session_id: str,
    user_id: str,
    repo_url: str,
    preferred_provider: str,
) -> dict[str, Any]:
    from app.db.session import AsyncSessionLocal
    from app.db.models.analysis_session import AnalysisSession, SessionStatus
    from app.services.github_service import GitHubService, GitHubError
    from app.services.ai_service import AIService, AllProvidersFailedError

    log = logger.bind(session_id=session_id, user_id=user_id, repo_url=repo_url)

    async with AsyncSessionLocal() as db:
        session = await db.get(AnalysisSession, UUID(session_id))
        if session is None:
            log.error("Session not found")
            return {"error": "session_not_found"}

        # ── Mark analyzing ────────────────────────────────────────────────────
        session.status = SessionStatus.ANALYZING
        await db.commit()
        log.info("Analysis started")

        try:
            # ── Fetch GitHub data ─────────────────────────────────────────────
            async with GitHubService() as gh:
                repo_data = await gh.fetch_repo_data(repo_url)

            # Store raw repo data
            repo_context = asdict(repo_data)
            session.repo_data = repo_context
            await db.commit()

            # ── Run AI analysis ───────────────────────────────────────────────
            ai = AIService(preferred_provider=preferred_provider)
            result = await ai.analyse_repository(repo_context)

            # ── Persist results ───────────────────────────────────────────────
            session.analysis_result = {
                "summary": result.summary,
                "tech_stack": result.tech_stack,
                "architecture": result.architecture,
                "code_quality": result.code_quality,
                "security": result.security,
                "performance": result.performance,
                "scalability": result.scalability,
                "recommendations": result.recommendations,
                "complexity_score": result.complexity_score,
                "complexity_explanation": result.complexity_explanation,
                "code_quality_score": result.code_quality_score,
                "security_score": result.security_score,
                "maintainability_score": result.maintainability_score,
            }
            session.ai_provider = result.usage.provider
            session.status = SessionStatus.COMPLETED
            session.completed_at = datetime.now(timezone.utc)
            await db.commit()

            log.info(
                "Analysis completed",
                provider=result.usage.provider,
                cost_usd=result.usage.cost_usd,
            )

            return {
                "session_id": session_id,
                "status": "completed",
                "provider": result.usage.provider,
            }

        except GitHubError as exc:
            error_msg = f"GitHub error: {exc}"
            log.warning("GitHub fetch failed", error=error_msg)
            session.status = SessionStatus.FAILED
            session.error_message = error_msg
            await db.commit()
            return {"session_id": session_id, "status": "failed", "error": error_msg}

        except AllProvidersFailedError as exc:
            error_msg = f"All AI providers failed: {exc}"
            log.error("AI analysis failed", error=error_msg)
            session.status = SessionStatus.FAILED
            session.error_message = error_msg
            await db.commit()
            return {"session_id": session_id, "status": "failed", "error": error_msg}

        except Exception as exc:
            error_msg = str(exc)
            log.exception("Unexpected analysis error")
            session.status = SessionStatus.FAILED
            session.error_message = error_msg
            await db.commit()
            # Retry on unexpected errors
            raise task.retry(exc=exc)
