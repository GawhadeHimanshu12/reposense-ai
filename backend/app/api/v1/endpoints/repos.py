"""
Repository analysis endpoints.

POST   /repos/analyze                   — submit a repo for AI analysis
GET    /repos/analysis/{session_id}     — poll status / fetch results
GET    /repos/my-analyses               — list the caller's past sessions
DELETE /repos/analysis/{session_id}     — soft-delete a session
GET    /repos/rate-limit                — current analysis rate-limit status
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Annotated

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.core.redis import get_redis
from app.db.models.analysis_session import AnalysisSession, SessionStatus
from app.db.models.user import User
from app.schemas.analysis import (
    AnalysisDetail,
    AnalysisSessionResponse,
    AnalysisSessionSummary,
    AnalyzeRequest,
    AnalyzeResponse,
    RateLimitBucketDetail,
    RepoRateLimitResponse,
)
from app.services.security_service import (
    URLValidationResult,
    sanitize_url_input,
    validate_github_url,
)

router = APIRouter()
logger = structlog.get_logger()

_FOLLOWUP_LIMIT = 10
_ANALYSIS_DAILY_LIMIT_KEY = "rl:repo_analysis:{user_id}"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _check_ownership(session: AnalysisSession, user: User) -> None:
    if session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def _get_session_or_404(
    session_id: uuid.UUID,
    db: AsyncSession,
) -> AnalysisSession:
    obj = await db.get(AnalysisSession, session_id)
    if obj is None or obj.status == "deleted":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return obj


def _build_session_response(s: AnalysisSession) -> AnalysisSessionResponse:
    analysis: AnalysisDetail | None = None
    if s.analysis_result:
        analysis = AnalysisDetail(**{
            k: s.analysis_result.get(k)
            for k in AnalysisDetail.model_fields
        })
    return AnalysisSessionResponse(
        session_id=s.id,
        status=s.status,
        repo_url=s.repo_url,
        repo_name=s.repo_name,
        repo_data=s.repo_data,
        analysis=analysis,
        ai_provider=s.ai_provider,
        error_message=s.error_message,
        created_at=s.created_at,
        completed_at=s.completed_at,
    )


def _build_summary(s: AnalysisSession) -> AnalysisSessionSummary:
    return AnalysisSessionSummary(
        session_id=s.id,
        repo_name=s.repo_name,
        repo_url=s.repo_url,
        ai_provider=s.ai_provider,
        status=s.status,
        created_at=s.created_at,
        completed_at=s.completed_at,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit a GitHub repository for AI analysis",
)
async def analyze_repo(
    payload: AnalyzeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> AnalyzeResponse:
    # ── Rate limit (3/24 h) ───────────────────────────────────────────────────
    if not user.is_admin:
        rl_key = _ANALYSIS_DAILY_LIMIT_KEY.format(user_id=user.id)
        count = await redis.incr(rl_key)
        if count == 1:
            await redis.expire(rl_key, 86_400)
        if count > settings.RATE_LIMIT_REPO_ANALYSIS_PER_DAY:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Daily repo analysis limit ({settings.RATE_LIMIT_REPO_ANALYSIS_PER_DAY}) reached",
            )

    # ── Validate URL ──────────────────────────────────────────────────────────
    clean_url = sanitize_url_input(payload.repo_url)
    result: URLValidationResult = validate_github_url(clean_url)
    if not result.valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.error)

    owner: str = result.owner  # type: ignore[assignment]
    repo_name: str = result.repo  # type: ignore[assignment]

    # ── Verify repo exists on GitHub ──────────────────────────────────────────
    from app.services.github_service import GitHubService, RepoNotFoundError, RepoPrivateError, RateLimitError

    try:
        async with GitHubService() as gh:
            await gh.validate_repo_exists(owner, repo_name)
    except RepoNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="GitHub repository not found or is private",
        )
    except RepoPrivateError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository is private — only public repositories are supported",
        )
    except RateLimitError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub API rate limit reached — try again later",
        )

    # ── Create session record ─────────────────────────────────────────────────
    session = AnalysisSession(
        user_id=user.id,
        repo_url=clean_url,
        repo_name=f"{owner}/{repo_name}",
        status=SessionStatus.PENDING,
        ai_provider="anthropic",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # ── Dispatch Celery task ──────────────────────────────────────────────────
    from app.tasks.analysis_tasks import analyze_repository_task

    analyze_repository_task.delay(
        session_id=str(session.id),
        user_id=str(user.id),
        repo_url=clean_url,
    )

    logger.info("Analysis queued", session_id=str(session.id), user_id=str(user.id))

    return AnalyzeResponse(session_id=session.id, status=SessionStatus.PENDING)


@router.get(
    "/analysis/{session_id}",
    response_model=AnalysisSessionResponse,
    summary="Get analysis status and results",
)
async def get_analysis(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisSessionResponse:
    session = await _get_session_or_404(session_id, db)
    _check_ownership(session, user)
    return _build_session_response(session)


@router.get(
    "/my-analyses",
    response_model=list[AnalysisSessionSummary],
    summary="List the caller's past analysis sessions",
)
async def my_analyses(
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AnalysisSessionSummary]:
    stmt = (
        select(AnalysisSession)
        .where(
            AnalysisSession.user_id == user.id,
            AnalysisSession.status != "deleted",
        )
        .order_by(AnalysisSession.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_build_summary(s) for s in rows]


@router.delete(
    "/analysis/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Soft-delete an analysis session",
)
async def delete_analysis(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    session = await _get_session_or_404(session_id, db)
    _check_ownership(session, user)

    # Soft delete — mark status so the row stays for audit purposes
    session.status = "deleted"
    await db.commit()

    logger.info("Session soft-deleted", session_id=str(session_id), user_id=str(user.id))


@router.get(
    "/rate-limit",
    response_model=RepoRateLimitResponse,
    summary="Current repo-analysis rate-limit status",
)
async def repo_rate_limit(
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
) -> RepoRateLimitResponse:
    rl_key = _ANALYSIS_DAILY_LIMIT_KEY.format(user_id=user.id)
    used_raw = await redis.get(rl_key)
    used = int(used_raw) if used_raw else 0

    ttl_seconds = await redis.ttl(rl_key)
    resets_at: datetime | None = None
    if ttl_seconds and ttl_seconds > 0:
        resets_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)

    limit = settings.RATE_LIMIT_REPO_ANALYSIS_PER_DAY
    return RepoRateLimitResponse(
        repo_analysis=RateLimitBucketDetail(
            used=used,
            limit=limit,
            remaining=max(0, limit - used),
            resets_at=resets_at,
        )
    )
