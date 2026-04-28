import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


# ── Request bodies ────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: str | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    avatar_url: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    """Payload for the ID-token flow: frontend sends a Google credential string."""
    id_token: str


class GoogleCodeRequest(BaseModel):
    """Payload for the auth-code flow: frontend sends a one-time authorization code."""
    code: str


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Response models ───────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str | None = None
    # Legacy field — kept for backward compat with the GitHub-OAuth path
    username: str | None = None
    avatar_url: str | None = None
    google_id: str | None = None
    github_id: str | None = None
    is_active: bool
    is_verified: bool
    is_admin: bool
    last_login: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AuthResponse(BaseModel):
    """Combined token pair + user profile returned on login / OAuth callback."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserStatsResponse(BaseModel):
    member_since: datetime
    total_analyses_completed: int
    total_questions_asked: int
    favorite_language: str | None = None
