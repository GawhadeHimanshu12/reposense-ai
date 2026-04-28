"""
Authentication endpoints.

Routes
──────
POST /auth/register         – email + password registration
POST /auth/login            – email + password login
POST /auth/refresh          – exchange refresh token for new pair
POST /auth/logout           – blocklist the current access token
GET  /auth/me               – return current user profile

POST /auth/google           – Google ID-token flow (preferred)
GET  /auth/google/url       – return the Google OAuth consent URL (auth-code flow)
GET  /auth/google/callback  – exchange auth code for tokens (auth-code flow)

GET  /auth/github/url       – return GitHub OAuth consent URL
GET  /auth/github/callback  – exchange GitHub code for tokens
"""

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import urlencode

from app.core.auth import exchange_google_code, issue_token_pair, upsert_user_from_google, verify_google_id_token
from app.core.config import settings
from app.core.deps import _resolve_token, get_current_user, get_db, get_redis
from app.core.security import (
    blocklist_token,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.db.models.user import User
from app.schemas.user import (
    AuthResponse,
    GoogleAuthRequest,
    GoogleCodeRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    UserCreate,
    UserResponse,
)

router = APIRouter()
logger = structlog.get_logger()


def _frontend_auth_redirect(tokens: TokenResponse) -> RedirectResponse:
    frontend_url = settings.ALLOWED_ORIGINS[0].rstrip("/") if settings.ALLOWED_ORIGINS else "http://localhost:3000"
    fragment = urlencode({
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "token_type": tokens.token_type,
    })
    return RedirectResponse(f"{frontend_url}/auth/callback#{fragment}", status_code=status.HTTP_302_FOUND)


# ── Email / Password ──────────────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        username=payload.username,
        name=payload.full_name,
        hashed_password=hash_password(payload.password),
        is_admin=bool(settings.ADMIN_EMAIL and payload.email.lower() == settings.ADMIN_EMAIL.lower()),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("User registered", email=user.email)
    return user


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    from datetime import datetime, timezone
    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    tokens = issue_token_pair(user)
    logger.info("User logged in", email=user.email)
    return AuthResponse(**tokens.model_dump(), user=UserResponse.model_validate(user))


# ── Token management ──────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(payload: RefreshRequest):
    """
    Exchange a valid refresh token for a new access + refresh token pair.
    The old refresh token is implicitly invalidated by being single-use in
    practice (short-lived; callers should discard it).
    """
    claims = decode_refresh_token(payload.refresh_token)
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    user_id = claims["sub"]
    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
)
async def logout(
    token_payload: dict = Depends(_resolve_token),
    redis=Depends(get_redis),
):
    """
    Blocklist the current access token's JTI so it cannot be reused.
    Clients should also discard the refresh token locally.
    """
    jti: str | None = token_payload.get("jti")
    if jti:
        await blocklist_token(redis, jti)
    logger.info("User logged out", user_id=token_payload.get("sub"))


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


# ── Google OAuth – ID-token flow ──────────────────────────────────────────────

@router.post("/google", response_model=AuthResponse)
async def google_id_token_login(
    payload: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify a Google ID token issued by the Google Sign-In JS SDK / One Tap.
    Creates or updates the user, returns a JWT pair.
    """
    try:
        claims = await verify_google_id_token(payload.id_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    user = await upsert_user_from_google(db, claims)
    tokens = issue_token_pair(user)
    logger.info("Google ID-token login", email=user.email)
    return AuthResponse(**tokens.model_dump(), user=UserResponse.model_validate(user))


# ── Google OAuth – auth-code flow ─────────────────────────────────────────────

@router.get("/google/url")
async def google_oauth_url():
    """Return the Google OAuth consent URL for the authorization-code flow."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    params = (
        f"client_id={settings.GOOGLE_CLIENT_ID}"
        f"&redirect_uri={settings.GOOGLE_CALLBACK_URL}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
    )
    return {"url": f"https://accounts.google.com/o/oauth2/v2/auth?{params}"}


@router.get("/google/callback", response_model=None)
async def google_code_callback(code: str, db: AsyncSession = Depends(get_db)):
    """Exchange a Google authorization code for tokens, upsert user, return JWT pair."""
    try:
        userinfo = await exchange_google_code(code)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Google auth-code exchange failed", error=str(exc))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google OAuth failed")

    google_access_token = userinfo.pop("_google_access_token", None)
    user = await upsert_user_from_google(db, userinfo, google_access_token=google_access_token)
    tokens = issue_token_pair(user)
    logger.info("Google auth-code login", email=user.email)
    return _frontend_auth_redirect(tokens)


# ── GitHub OAuth ──────────────────────────────────────────────────────────────

@router.get("/github/url")
async def github_oauth_url():
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")
    params = f"client_id={settings.GITHUB_CLIENT_ID}&scope=read:user,user:email,repo"
    return {"url": f"https://github.com/login/oauth/authorize?{params}"}


@router.get("/github/callback", response_model=None)
async def github_callback(code: str, db: AsyncSession = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
        token_data = token_resp.json()
        gh_access_token = token_data.get("access_token")
        if not gh_access_token:
            raise HTTPException(status_code=400, detail="GitHub OAuth failed")

        gh_resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {gh_access_token}"},
        )
        gh_user = gh_resp.json()

        # Fetch primary email if not public
        email: str = gh_user.get("email") or ""
        if not email:
            emails_resp = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {gh_access_token}"},
            )
            emails = emails_resp.json()
            primary = next((e for e in emails if e.get("primary")), None)
            email = primary["email"] if primary else f"{gh_user['login']}@github.local"

    result = await db.execute(select(User).where(User.github_id == str(gh_user["id"])))
    user = result.scalar_one_or_none()

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    if user is None:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user is None:
        user = User(
            email=email,
            username=gh_user["login"],
            name=gh_user.get("name"),
            avatar_url=gh_user.get("avatar_url"),
            github_id=str(gh_user["id"]),
            github_access_token=gh_access_token,
            is_verified=True,
            last_login=now,
        )
        db.add(user)
        logger.info("New user created via GitHub OAuth", email=email)
    else:
        user.github_id = str(gh_user["id"])
        user.github_access_token = gh_access_token
        user.last_login = now
        logger.info("Existing user logged in via GitHub OAuth", email=email)

    if settings.ADMIN_EMAIL and email.lower() == settings.ADMIN_EMAIL.lower():
        user.is_admin = True

    await db.commit()
    await db.refresh(user)

    tokens = issue_token_pair(user)
    return _frontend_auth_redirect(tokens)
