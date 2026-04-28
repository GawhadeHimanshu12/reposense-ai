from collections import Counter

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import _resolve_token, get_current_user, get_db
from app.core.redis import get_redis
from app.core.security import blocklist_token
from app.db.models.analysis_session import AnalysisSession, ChatMessage, MessageRole, SessionStatus
from app.db.models.user import User
from app.schemas.user import UserResponse, UserStatsResponse, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: UserUpdate,
    # FastAPI caches Depends per-request, so this is the same session
    # that get_current_user already used.
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/me/stats", response_model=UserStatsResponse)
async def get_my_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    total_analyses = (
        await db.execute(
            select(func.count(AnalysisSession.id)).where(
                AnalysisSession.user_id == user.id,
                AnalysisSession.status == SessionStatus.COMPLETED,
            )
        )
    ).scalar_one()
    total_questions = (
        await db.execute(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.user_id == user.id,
                ChatMessage.role == MessageRole.USER,
            )
        )
    ).scalar_one()

    languages = (
        await db.execute(
            select(AnalysisSession.repo_data).where(
                AnalysisSession.user_id == user.id,
                AnalysisSession.status == SessionStatus.COMPLETED,
            )
        )
    ).scalars().all()

    counts: Counter[str] = Counter()
    for data in languages:
        if not data:
            continue
        language = data.get("metadata", {}).get("language")
        if isinstance(language, str) and language.strip():
            counts[language.strip()] += 1

    favorite_language = counts.most_common(1)[0][0] if counts else None

    return UserStatsResponse(
        member_since=user.created_at,
        total_analyses_completed=total_analyses,
        total_questions_asked=total_questions,
        favorite_language=favorite_language,
    )


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
)
async def delete_me(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    token_payload: dict = Depends(_resolve_token),
    redis=Depends(get_redis),
):
    if not user.is_active:
        return

    user.is_active = False
    user.is_verified = False
    user.name = None
    user.username = None
    user.avatar_url = None
    user.google_id = None
    user.google_access_token = None
    user.github_id = None
    user.github_access_token = None
    user.hashed_password = None
    user.email = f"deleted+{user.id}@reposense.ai"

    await db.commit()

    jti: str | None = token_payload.get("jti")
    if jti:
        await blocklist_token(redis, jti)
