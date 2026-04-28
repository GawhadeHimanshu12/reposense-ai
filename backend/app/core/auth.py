"""
Google OAuth helper.

Supports two flows:
  1. ID-token flow  – frontend obtains an ID token via Google Sign-In JS SDK
     and POSTs it to /auth/google.  Backend verifies with google-auth library.
  2. Auth-code flow – frontend sends an authorization code; backend exchanges
     it for tokens at Google's token endpoint (GOOGLE_TOKEN_ENDPOINT).

In both cases the result is a User row (created or updated) and a JWT pair.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.db.models.user import User
from app.schemas.user import TokenResponse

logger = structlog.get_logger()


# ── ID-token verification ─────────────────────────────────────────────────────

async def verify_google_id_token(token: str) -> dict[str, Any]:
    """
    Verify a Google ID token and return its claims dict.

    Verification is CPU-bound (RSA signature check) so we run it in a
    thread-pool to avoid blocking the event loop.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID is not configured")

    request = google_requests.Request()

    try:
        claims: dict[str, Any] = await asyncio.to_thread(
            google_id_token.verify_oauth2_token,
            token,
            request,
            settings.GOOGLE_CLIENT_ID,
        )
    except GoogleAuthError as exc:
        logger.warning("Google ID token verification failed", error=str(exc))
        raise ValueError(f"Invalid Google token: {exc}") from exc

    return claims


# ── Auth-code exchange ────────────────────────────────────────────────────────

async def exchange_google_code(code: str) -> dict[str, Any]:
    """
    Exchange an authorization code for Google tokens, then fetch user info.
    Returns a dict with at minimum: sub, email, name, picture.
    """
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            settings.GOOGLE_TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_CALLBACK_URL,
                "grant_type": "authorization_code",
            },
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()

        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("Google token exchange returned no access_token")

        userinfo_resp = await client.get(
            settings.GOOGLE_USERINFO_ENDPOINT,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        userinfo_resp.raise_for_status()
        userinfo = userinfo_resp.json()

    # Merge: userinfo may carry more fields than the ID token
    return {**token_data, **userinfo, "_google_access_token": access_token}


# ── User upsert ───────────────────────────────────────────────────────────────

async def upsert_user_from_google(
    db: AsyncSession,
    claims: dict[str, Any],
    google_access_token: str | None = None,
) -> User:
    """
    Create or update a User from Google ID-token / userinfo claims.

    Lookup order: google_id → email (to merge with an existing account).
    Sets `is_verified=True` because Google has already verified the email.
    """
    google_id = str(claims["sub"])
    email: str = claims.get("email", "")
    name: str | None = claims.get("name")
    picture: str | None = claims.get("picture")

    # 1. Find by google_id
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    # 2. Fall back to email lookup (account linking)
    if user is None and email:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if user is None:
        user = User(
            email=email,
            name=name,
            avatar_url=picture,
            google_id=google_id,
            google_access_token=google_access_token,
            is_verified=True,
            last_login=now,
        )
        db.add(user)
        logger.info("New user created via Google OAuth", email=email)
    else:
        user.google_id = google_id
        if google_access_token:
            user.google_access_token = google_access_token
        if name and not user.name:
            user.name = name
        if picture and not user.avatar_url:
            user.avatar_url = picture
        user.is_verified = True
        user.last_login = now
        logger.info("Existing user logged in via Google OAuth", email=email)

    if settings.ADMIN_EMAIL and email.lower() == settings.ADMIN_EMAIL.lower():
        user.is_admin = True

    await db.commit()
    await db.refresh(user)
    return user


# ── JWT pair factory ──────────────────────────────────────────────────────────

def issue_token_pair(user: User) -> TokenResponse:
    """Return a fresh access + refresh token pair for the given user."""
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )
