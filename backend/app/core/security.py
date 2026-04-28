"""
JWT utilities and password hashing.

Token anatomy
─────────────
Access token  – short-lived (default 30 min), signed with SECRET_KEY.
Refresh token – long-lived (default 7 days), signed with REFRESH_TOKEN_SECRET,
                carries `"type": "refresh"` claim.
Both tokens carry a `jti` (JWT ID) so they can be individually blocklisted on
logout without invalidating every token for that user.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import redis.asyncio as aioredis
import structlog
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

logger = structlog.get_logger()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_ALGORITHM = settings.JWT_ALGORITHM
_BLOCKLIST_PREFIX = "token_blocklist:"


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── Token creation ────────────────────────────────────────────────────────────

def _build_token(
    subject: Any,
    secret: str,
    expires_delta: timedelta,
    extra_claims: dict | None = None,
) -> str:
    jti = str(uuid.uuid4())
    expire = datetime.now(timezone.utc) + expires_delta
    payload: dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": jti,
        **(extra_claims or {}),
    }
    return jwt.encode(payload, secret, algorithm=_ALGORITHM)


def create_access_token(subject: Any, expires_delta: timedelta | None = None) -> str:
    return _build_token(
        subject=subject,
        secret=settings.SECRET_KEY,
        expires_delta=expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(subject: Any) -> str:
    return _build_token(
        subject=subject,
        secret=settings.effective_refresh_secret,
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        extra_claims={"type": "refresh"},
    )


# ── Token verification ────────────────────────────────────────────────────────

def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[_ALGORITHM])
    except JWTError:
        return None


def decode_refresh_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.effective_refresh_secret, algorithms=[_ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None


# Keep the old name so existing callers don't break (delegates to access-token decode).
def verify_token(token: str) -> dict | None:
    return decode_access_token(token)


# ── Token blocklist (logout) ──────────────────────────────────────────────────

async def blocklist_token(redis: aioredis.Redis, jti: str, ttl_seconds: int | None = None) -> None:
    """Mark a JTI as revoked.  TTL defaults to the configured blocklist window."""
    ttl = ttl_seconds if ttl_seconds is not None else settings.BLOCKLIST_TTL_SECONDS
    key = f"{_BLOCKLIST_PREFIX}{jti}"
    await redis.setex(key, ttl, "1")
    logger.debug("Token blocklisted", jti=jti)


async def is_token_blocked(redis: aioredis.Redis, jti: str) -> bool:
    key = f"{_BLOCKLIST_PREFIX}{jti}"
    return bool(await redis.exists(key))
