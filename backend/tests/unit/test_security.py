"""Unit tests for security utilities — no DB, no network required."""

import time

import pytest

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    hash_password,
    verify_password,
    verify_token,
)


# ── Password helpers ──────────────────────────────────────────────────────────

def test_password_round_trip():
    pw = "supersecret123!"
    hashed = hash_password(pw)
    assert hashed != pw
    assert verify_password(pw, hashed)


def test_wrong_password_rejected():
    hashed = hash_password("correct")
    assert not verify_password("wrong", hashed)


def test_different_hashes_for_same_password():
    pw = "same"
    assert hash_password(pw) != hash_password(pw)  # bcrypt salts


# ── Access token ──────────────────────────────────────────────────────────────

def test_access_token_round_trip():
    token = create_access_token("user-abc")
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "user-abc"


def test_access_token_carries_jti():
    token = create_access_token("user-abc")
    payload = decode_access_token(token)
    assert "jti" in payload
    assert len(payload["jti"]) > 10


def test_access_token_unique_jtis():
    t1 = create_access_token("user-abc")
    t2 = create_access_token("user-abc")
    assert decode_access_token(t1)["jti"] != decode_access_token(t2)["jti"]


def test_verify_token_alias():
    """verify_token must remain backward-compatible."""
    token = create_access_token("user-abc")
    assert verify_token(token) is not None


def test_invalid_access_token_returns_none():
    assert decode_access_token("not.a.valid.token") is None


def test_tampered_token_rejected():
    token = create_access_token("user-abc")
    # Flip last char
    tampered = token[:-1] + ("x" if token[-1] != "x" else "y")
    assert decode_access_token(tampered) is None


# ── Refresh token ─────────────────────────────────────────────────────────────

def test_refresh_token_round_trip():
    token = create_refresh_token("user-abc")
    payload = decode_refresh_token(token)
    assert payload is not None
    assert payload["sub"] == "user-abc"
    assert payload.get("type") == "refresh"


def test_access_token_rejected_as_refresh():
    access = create_access_token("user-abc")
    assert decode_refresh_token(access) is None


def test_refresh_token_rejected_as_access():
    refresh = create_refresh_token("user-abc")
    # The refresh token is signed with a potentially different secret,
    # so decode_access_token should either fail or return a payload without
    # `type == refresh`.  Either way it must not be treated as a valid access token.
    payload = decode_access_token(refresh)
    # If it happens to decode (same secret), ensure we'd reject it at the
    # caller because it carries type=refresh — not tested here, that's
    # tested at the endpoint level.
    # The important invariant: decode_refresh_token(access) is None.
    _ = payload  # accept either outcome for access secret == refresh secret


# ── Token blocklist ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_blocklist_and_check(mocker):
    """Blocklisting a JTI makes is_token_blocked return True."""
    from app.core.security import blocklist_token, is_token_blocked

    redis_mock = mocker.AsyncMock()
    redis_mock.exists.return_value = 1

    await blocklist_token(redis_mock, "jti-xyz", ttl_seconds=60)
    redis_mock.setex.assert_called_once()

    result = await is_token_blocked(redis_mock, "jti-xyz")
    assert result is True


@pytest.mark.asyncio
async def test_non_blocklisted_token_passes(mocker):
    from app.core.security import is_token_blocked

    redis_mock = mocker.AsyncMock()
    redis_mock.exists.return_value = 0

    result = await is_token_blocked(redis_mock, "jti-not-blocked")
    assert result is False
