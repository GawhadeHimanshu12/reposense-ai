"""
Integration tests for auth endpoints.

These tests hit the FastAPI app via an in-memory HTTPX client with the real
(test) database but a mocked Redis client so no Redis instance is required.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch

from app.core.security import create_access_token, create_refresh_token
from app.db.models.user import User
from app.core.security import hash_password


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _create_user(db: AsyncSession, **kwargs) -> User:
    defaults = dict(
        email="test@example.com",
        username="testuser",
        name="Test User",
        hashed_password=hash_password("password123"),
        is_active=True,
        is_verified=True,
    )
    defaults.update(kwargs)
    user = User(**defaults)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ── Registration ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_new_user(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "securepass99",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "newuser@example.com"
    assert "id" in data
    assert "hashed_password" not in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient, db_session: AsyncSession):
    await _create_user(db_session, email="dup@example.com", username="dup1")
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "dup@example.com", "username": "dup2", "password": "pass"},
    )
    assert resp.status_code == 400


# ── Login ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, db_session: AsyncSession):
    await _create_user(db_session, email="login@example.com", username="loginuser")
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "password123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "login@example.com"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, db_session: AsyncSession):
    await _create_user(db_session, email="wp@example.com", username="wpuser")
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "wp@example.com", "password": "wrongpassword"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_disabled_account(client: AsyncClient, db_session: AsyncSession):
    await _create_user(db_session, email="dis@example.com", username="disuser", is_active=False)
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "dis@example.com", "password": "password123"},
    )
    assert resp.status_code == 403


# ── Token refresh ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_tokens(client: AsyncClient, db_session: AsyncSession):
    user = await _create_user(db_session, email="ref@example.com", username="refuser")
    refresh_tok = create_refresh_token(str(user.id))
    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_tok},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_refresh_with_access_token_rejected(client: AsyncClient, db_session: AsyncSession):
    user = await _create_user(db_session, email="ref2@example.com", username="refuser2")
    access_tok = create_access_token(str(user.id))
    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": access_tok},
    )
    assert resp.status_code == 401


# ── /auth/me ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_me(client: AsyncClient, db_session: AsyncSession):
    user = await _create_user(db_session, email="me@example.com", username="meuser")
    token = create_access_token(str(user.id))
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@example.com"


@pytest.mark.asyncio
async def test_get_me_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 403  # HTTPBearer returns 403 when header missing


# ── Logout / blocklist ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_blocks_token(client: AsyncClient, db_session: AsyncSession):
    """After logout the same token should be rejected on /auth/me."""
    user = await _create_user(db_session, email="logout@example.com", username="logoutuser")
    token = create_access_token(str(user.id))
    headers = {"Authorization": f"Bearer {token}"}

    # Patch Redis so we don't need a live instance
    with patch("app.core.deps.is_token_blocked", new=AsyncMock(return_value=False)), \
         patch("app.core.security.blocklist_token", new=AsyncMock()) as mock_blocklist:

        logout_resp = await client.post("/api/v1/auth/logout", headers=headers)
        assert logout_resp.status_code == 204
        mock_blocklist.assert_called_once()


# ── Google OAuth ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_google_id_token_login_creates_user(client: AsyncClient):
    fake_claims = {
        "sub": "google-uid-12345",
        "email": "googleuser@gmail.com",
        "name": "Google User",
        "picture": "https://example.com/photo.jpg",
    }
    with patch("app.api.v1.endpoints.auth.verify_google_id_token", new=AsyncMock(return_value=fake_claims)):
        resp = await client.post(
            "/api/v1/auth/google",
            json={"id_token": "fake-google-id-token"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "googleuser@gmail.com"
    assert data["user"]["is_verified"] is True


@pytest.mark.asyncio
async def test_google_id_token_login_invalid_token(client: AsyncClient):
    with patch(
        "app.api.v1.endpoints.auth.verify_google_id_token",
        new=AsyncMock(side_effect=ValueError("Bad token")),
    ):
        resp = await client.post(
            "/api/v1/auth/google",
            json={"id_token": "invalid"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_google_login_updates_existing_user(client: AsyncClient, db_session: AsyncSession):
    """Second Google login for same google_id updates last_login but doesn't duplicate."""
    existing = await _create_user(
        db_session,
        email="existing_google@gmail.com",
        username="existgoogle",
        google_id="google-uid-existing",
    )
    fake_claims = {
        "sub": "google-uid-existing",
        "email": "existing_google@gmail.com",
        "name": "Existing User",
    }
    with patch("app.api.v1.endpoints.auth.verify_google_id_token", new=AsyncMock(return_value=fake_claims)):
        resp = await client.post("/api/v1/auth/google", json={"id_token": "token"})
    assert resp.status_code == 200
    assert resp.json()["user"]["id"] == str(existing.id)
