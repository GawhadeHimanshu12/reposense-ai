"""
FastAPI dependency functions shared across endpoint modules.
"""

from typing import AsyncGenerator

import redis.asyncio as aioredis
import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.core.security import decode_access_token, is_token_blocked
from app.db.models.user import User
from app.db.session import AsyncSessionLocal

logger = structlog.get_logger()

_bearer = HTTPBearer(auto_error=True)

# ── Database ──────────────────────────────────────────────────────────────────


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# ── Auth: decode token, check blocklist ───────────────────────────────────────


async def _resolve_token(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    redis: aioredis.Redis = Depends(get_redis),
) -> dict:
    """Decode the Bearer token and verify it has not been blocklisted."""
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        )

    jti: str | None = payload.get("jti")
    if jti and await is_token_blocked(redis, jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    return payload


async def get_current_user_id(payload: dict = Depends(_resolve_token)) -> str:
    """Return the user ID string from a validated access token."""
    return payload["sub"]


async def get_current_user(
    payload: dict = Depends(_resolve_token),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the full User row from a validated access token."""
    user_id: str = payload["sub"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or account disabled",
        )
    return user


async def get_current_admin_user(user: User = Depends(get_current_user)) -> User:
    """Require that the authenticated user has admin privileges."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


# ── Rate limiting ─────────────────────────────────────────────────────────────


async def rate_limit(
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
) -> None:
    """
    Generic per-user, per-minute Redis rate limit (default bucket).
    Raises 429 when the user exceeds RATE_LIMIT_PER_MINUTE requests/min.
    """
    from app.core.config import settings  # local to avoid circular at import time

    key = f"rl:general:{user.id}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 60)
    if count > settings.RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded — try again in a minute",
        )


async def rate_limit_analysis(
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
) -> None:
    """Stricter daily limit for repo analysis requests."""
    from app.core.config import settings

    key = f"rl:repo_analysis:{user.id}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86_400)  # 24 h window
    if count > settings.RATE_LIMIT_REPO_ANALYSIS_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily repo analysis limit ({settings.RATE_LIMIT_REPO_ANALYSIS_PER_DAY}) reached",
        )


async def rate_limit_followup(
    user: User = Depends(get_current_user),
    redis: aioredis.Redis = Depends(get_redis),
) -> None:
    """Daily limit for follow-up chat messages."""
    from app.core.config import settings

    key = f"rl:followup:{user.id}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86_400)
    if count > settings.RATE_LIMIT_FOLLOWUP_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily follow-up limit ({settings.RATE_LIMIT_FOLLOWUP_PER_DAY}) reached",
        )
