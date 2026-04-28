from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr


# ── User management ───────────────────────────────────────────────────────────

class AdminUserSummary(BaseModel):
    id: uuid.UUID
    email: str
    name: str | None
    avatar_url: str | None
    is_admin: bool
    is_banned: bool
    is_active: bool
    analyses_count: int
    chat_messages_count: int
    last_login: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminUserDetail(AdminUserSummary):
    google_id: str | None
    github_id: str | None
    analyses: list[dict[str, Any]]
    recent_activity: list[dict[str, Any]]


class AdminUserListResponse(BaseModel):
    items: list[AdminUserSummary]
    total: int
    skip: int
    limit: int


class UserPatchRequest(BaseModel):
    is_admin: bool | None = None
    is_banned: bool | None = None
    is_active: bool | None = None


class UserPatchResponse(BaseModel):
    id: uuid.UUID
    is_admin: bool
    is_banned: bool
    is_active: bool


# ── Chat logs ─────────────────────────────────────────────────────────────────

class AdminChatSessionSummary(BaseModel):
    session_id: uuid.UUID
    user_email: str
    user_name: str | None
    repo_name: str
    ai_provider: str
    status: str
    message_count: int
    created_at: datetime
    completed_at: datetime | None


class AdminChatSessionListResponse(BaseModel):
    items: list[AdminChatSessionSummary]
    total: int
    skip: int
    limit: int


class AdminChatMessage(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    tokens_used: int | None
    created_at: datetime


class AdminChatDetail(BaseModel):
    session_id: uuid.UUID
    user_email: str
    user_name: str | None
    repo_name: str
    repo_url: str
    ai_provider: str
    status: str
    messages: list[AdminChatMessage]
    created_at: datetime
    completed_at: datetime | None


# ── AI providers ──────────────────────────────────────────────────────────────

class ProviderStats(BaseModel):
    enabled: bool
    is_default: bool
    api_key_configured: bool
    total_requests: int
    total_cost_usd: float
    avg_response_time_ms: float | None


class ProviderUpdateRequest(BaseModel):
    enabled: bool | None = None
    is_default: bool | None = None


class ProviderConfigureRequest(BaseModel):
    api_key: str


class ProviderTestResponse(BaseModel):
    success: bool
    latency_ms: float | None = None
    message: str


# ── System settings ───────────────────────────────────────────────────────────

class SystemSettingsResponse(BaseModel):
    rate_limits: dict[str, Any]
    feature_flags: dict[str, Any]
    ai_defaults: dict[str, Any]
    security: dict[str, Any]


class SettingsPatchRequest(BaseModel):
    key: str
    value: Any


class SettingsPatchResponse(BaseModel):
    key: str
    value: Any
    updated_at: datetime


# ── Analytics ─────────────────────────────────────────────────────────────────

class OverviewStats(BaseModel):
    total_users: int
    active_users_7d: int
    total_analyses: int
    analyses_24h: int
    total_chats: int
    avg_followups: float
    ai_requests_24h: int


class UsageDataPoint(BaseModel):
    period: str
    analyses: int
    new_users: int
    questions_asked: int


class UsageResponse(BaseModel):
    group_by: str
    data: list[UsageDataPoint]
    provider_breakdown: dict[str, int]


class CostBreakdown(BaseModel):
    provider: str
    total_requests: int
    total_input_tokens: int
    total_output_tokens: int
    estimated_cost_usd: float


class CostsResponse(BaseModel):
    date_from: datetime | None
    date_to: datetime | None
    breakdown: list[CostBreakdown]
    total_cost_usd: float


# ── Audit log ─────────────────────────────────────────────────────────────────

class AuditLogEntry(BaseModel):
    id: uuid.UUID
    admin_email: str | None
    admin_name: str | None
    action: str
    target_type: str | None
    target_id: str | None
    details: dict[str, Any] | None
    ip_address: str | None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogEntry]
    total: int
    skip: int
    limit: int
