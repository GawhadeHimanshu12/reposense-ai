"""
Admin panel API.

All routes require is_admin=True. Every mutating action is written to audit_logs.

USER MANAGEMENT
  GET    /admin/users
  GET    /admin/users/{user_id}
  PATCH  /admin/users/{user_id}
  DELETE /admin/users/{user_id}

CHAT LOGS
  GET    /admin/chats
  GET    /admin/chats/export
  GET    /admin/chats/{session_id}

AI PROVIDERS
  GET    /admin/ai/providers
  PATCH  /admin/ai/providers/{name}
  POST   /admin/ai/providers/{name}/configure
  POST   /admin/ai/test/{name}

SYSTEM SETTINGS
  GET    /admin/settings
  PATCH  /admin/settings

ANALYTICS
  GET    /admin/stats/overview
  GET    /admin/stats/usage
  GET    /admin/stats/costs

AUDIT LOG
  GET    /admin/audit
"""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Literal
from uuid import UUID

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_admin_user, get_db
from app.core.redis import get_redis
from app.db.models.analysis_session import AnalysisSession, ChatMessage, SessionStatus
from app.db.models.audit_log import AuditLog
from app.db.models.system_settings import SystemSettings
from app.db.models.user import User
from app.schemas.admin import (
    AdminChatDetail,
    AdminChatMessage,
    AdminChatSessionListResponse,
    AdminChatSessionSummary,
    AdminUserDetail,
    AdminUserListResponse,
    AdminUserSummary,
    AuditLogEntry,
    AuditLogListResponse,
    CostBreakdown,
    CostsResponse,
    OverviewStats,
    ProviderConfigureRequest,
    ProviderStats,
    ProviderTestResponse,
    ProviderUpdateRequest,
    SettingsPatchRequest,
    SettingsPatchResponse,
    SystemSettingsResponse,
    UsageDataPoint,
    UsageResponse,
    UserPatchRequest,
    UserPatchResponse,
)
from app.services.ai_service import AIService, FALLBACK_ORDER

router = APIRouter()
logger = structlog.get_logger()

_PROVIDER_MODELS = {
    "anthropic": "claude-sonnet-4-6",
    "openai": "gpt-4-turbo",
    "gemini": "gemini-1.5-pro",
}
_PROVIDER_KEY_NAMES = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
}

# ── Shared helpers ────────────────────────────────────────────────────────────


def _client_ip(request: Request) -> str:
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _audit(
    db: AsyncSession,
    admin: User,
    action: str,
    *,
    target_type: str | None = None,
    target_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    entry = AuditLog(
        admin_id=admin.id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
        ip_address=ip,
    )
    db.add(entry)
    await db.flush()  # write within current transaction; caller commits
    logger.info("audit", admin_id=str(admin.id), action=action, target_id=target_id)


async def _get_ai_settings(db: AsyncSession) -> dict[str, Any]:
    row = await db.get(SystemSettings, "ai_defaults")
    return row.value if (row and isinstance(row.value, dict)) else {}


async def _save_ai_settings(db: AsyncSession, admin: User, value: dict[str, Any]) -> None:
    row = await db.get(SystemSettings, "ai_defaults")
    if row is None:
        row = SystemSettings(key="ai_defaults", value=value, updated_by=admin.id)
        db.add(row)
    else:
        row.value = value
        row.updated_by = admin.id
    await db.flush()


# ── USER MANAGEMENT ───────────────────────────────────────────────────────────


@router.get("/users", response_model=AdminUserListResponse, summary="List all users")
async def list_users(
    search: str | None = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    sort_by: Literal["created_at", "last_login", "email"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListResponse:
    sort_col = {
        "created_at": User.created_at,
        "last_login": User.last_login,
        "email": User.email,
    }[sort_by]
    order_expr = sort_col.desc() if order == "desc" else sort_col.asc()

    base_stmt = select(User)
    if search:
        pattern = f"%{search}%"
        base_stmt = base_stmt.where(
            User.email.ilike(pattern) | User.name.ilike(pattern)
        )

    total = (await db.execute(select(func.count()).select_from(base_stmt.subquery()))).scalar_one()
    rows = (await db.execute(base_stmt.order_by(order_expr).offset(skip).limit(limit))).scalars().all()

    items = []
    for u in rows:
        analyses_count = (
            await db.execute(
                select(func.count(AnalysisSession.id)).where(
                    AnalysisSession.user_id == u.id,
                    AnalysisSession.status != "deleted",
                )
            )
        ).scalar_one()
        messages_count = (
            await db.execute(
                select(func.count(ChatMessage.id)).where(ChatMessage.user_id == u.id)
            )
        ).scalar_one()
        items.append(
            AdminUserSummary(
                id=u.id,
                email=u.email,
                name=u.name,
                avatar_url=u.avatar_url,
                is_admin=u.is_admin,
                is_banned=u.is_banned,
                is_active=u.is_active,
                analyses_count=analyses_count,
                chat_messages_count=messages_count,
                last_login=u.last_login,
                created_at=u.created_at,
            )
        )

    return AdminUserListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/users/{user_id}", response_model=AdminUserDetail, summary="Detailed user profile")
async def get_user(
    user_id: UUID,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetail:
    u = await db.get(User, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Recent analyses (last 10)
    sessions = (
        await db.execute(
            select(AnalysisSession)
            .where(AnalysisSession.user_id == user_id, AnalysisSession.status != "deleted")
            .order_by(AnalysisSession.created_at.desc())
            .limit(10)
        )
    ).scalars().all()

    analyses = [
        {
            "session_id": str(s.id),
            "repo_name": s.repo_name,
            "status": s.status,
            "ai_provider": s.ai_provider,
            "created_at": s.created_at.isoformat(),
        }
        for s in sessions
    ]

    # Recent audit log entries involving this user
    audit_rows = (
        await db.execute(
            select(AuditLog)
            .where(AuditLog.target_id == str(user_id))
            .order_by(AuditLog.created_at.desc())
            .limit(10)
        )
    ).scalars().all()

    activity = [
        {
            "action": a.action,
            "details": a.details,
            "timestamp": a.created_at.isoformat(),
        }
        for a in audit_rows
    ]

    analyses_count = (
        await db.execute(
            select(func.count(AnalysisSession.id)).where(
                AnalysisSession.user_id == user_id,
                AnalysisSession.status != "deleted",
            )
        )
    ).scalar_one()
    messages_count = (
        await db.execute(
            select(func.count(ChatMessage.id)).where(ChatMessage.user_id == user_id)
        )
    ).scalar_one()

    return AdminUserDetail(
        id=u.id,
        email=u.email,
        name=u.name,
        avatar_url=u.avatar_url,
        is_admin=u.is_admin,
        is_banned=u.is_banned,
        is_active=u.is_active,
        google_id=u.google_id,
        github_id=u.github_id,
        analyses_count=analyses_count,
        chat_messages_count=messages_count,
        last_login=u.last_login,
        created_at=u.created_at,
        analyses=analyses,
        recent_activity=activity,
    )


@router.patch("/users/{user_id}", response_model=UserPatchResponse, summary="Update user flags")
async def patch_user(
    user_id: UUID,
    payload: UserPatchRequest,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> UserPatchResponse:
    u = await db.get(User, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")

    changes: dict[str, Any] = {}
    if payload.is_admin is not None:
        u.is_admin = payload.is_admin
        changes["is_admin"] = payload.is_admin
    if payload.is_banned is not None:
        u.is_banned = payload.is_banned
        # Banned users are also deactivated
        if payload.is_banned:
            u.is_active = False
        changes["is_banned"] = payload.is_banned
    if payload.is_active is not None:
        u.is_active = payload.is_active
        changes["is_active"] = payload.is_active

    await _audit(
        db, admin, "patch_user",
        target_type="user", target_id=str(user_id),
        details=changes, ip=_client_ip(request),
    )
    await db.commit()

    return UserPatchResponse(id=u.id, is_admin=u.is_admin, is_banned=u.is_banned, is_active=u.is_active)


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Soft-delete a user account",
)
async def delete_user(
    user_id: UUID,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    u = await db.get(User, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="User not found")
    if u.is_admin:
        raise HTTPException(status_code=403, detail="Cannot delete an admin account")
    if u.id == admin.id:
        raise HTTPException(status_code=403, detail="Cannot delete your own account")

    # Deactivate and ban
    u.is_active = False
    u.is_banned = True

    # Soft-delete all their sessions
    await db.execute(
        update(AnalysisSession)
        .where(AnalysisSession.user_id == user_id)
        .values(status="deleted")
    )

    await _audit(
        db, admin, "delete_user",
        target_type="user", target_id=str(user_id),
        details={"email": u.email}, ip=_client_ip(request),
    )
    await db.commit()


# ── CHAT LOGS ─────────────────────────────────────────────────────────────────


def _chat_filters(
    stmt,
    user_id: UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
    ai_provider: str | None,
):
    if user_id:
        stmt = stmt.where(AnalysisSession.user_id == user_id)
    if date_from:
        stmt = stmt.where(AnalysisSession.created_at >= date_from)
    if date_to:
        stmt = stmt.where(AnalysisSession.created_at <= date_to)
    if ai_provider:
        stmt = stmt.where(AnalysisSession.ai_provider == ai_provider)
    return stmt


@router.get("/chats", response_model=AdminChatSessionListResponse, summary="List all chat sessions")
async def list_chats(
    user_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    ai_provider: str | None = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminChatSessionListResponse:
    base = select(AnalysisSession).where(AnalysisSession.status != "deleted")
    base = _chat_filters(base, user_id, date_from, date_to, ai_provider)

    total = (
        await db.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    sessions = (
        await db.execute(base.order_by(AnalysisSession.created_at.desc()).offset(skip).limit(limit))
    ).scalars().all()

    items = []
    for s in sessions:
        u = await db.get(User, s.user_id)
        msg_count = (
            await db.execute(
                select(func.count(ChatMessage.id)).where(ChatMessage.session_id == s.id)
            )
        ).scalar_one()
        items.append(
            AdminChatSessionSummary(
                session_id=s.id,
                user_email=u.email if u else "deleted",
                user_name=u.name if u else None,
                repo_name=s.repo_name,
                ai_provider=s.ai_provider,
                status=s.status,
                message_count=msg_count,
                created_at=s.created_at,
                completed_at=s.completed_at,
            )
        )

    return AdminChatSessionListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/chats/export", summary="Export chat logs as JSON or CSV")
async def export_chats(
    fmt: Literal["json", "csv"] = "json",
    user_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    ai_provider: str | None = None,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    base = select(AnalysisSession).where(AnalysisSession.status != "deleted")
    base = _chat_filters(base, user_id, date_from, date_to, ai_provider)
    sessions = (await db.execute(base.order_by(AnalysisSession.created_at.desc()))).scalars().all()

    rows: list[dict[str, Any]] = []
    for s in sessions:
        u = await db.get(User, s.user_id)
        msgs = (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == s.id)
                .order_by(ChatMessage.created_at)
            )
        ).scalars().all()
        rows.append({
            "session_id": str(s.id),
            "user_email": u.email if u else "deleted",
            "repo_name": s.repo_name,
            "ai_provider": s.ai_provider,
            "status": s.status,
            "created_at": s.created_at.isoformat(),
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "tokens_used": m.tokens_used,
                    "created_at": m.created_at.isoformat(),
                }
                for m in msgs
            ],
        })

    if fmt == "json":
        body = json.dumps(rows, ensure_ascii=False, indent=2)
        return StreamingResponse(
            iter([body]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=chats.json"},
        )

    # CSV — flatten one row per message
    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=["session_id", "user_email", "repo_name", "ai_provider", "status",
                    "session_created_at", "role", "content", "tokens_used", "message_created_at"],
    )
    writer.writeheader()
    for s in rows:
        for m in s["messages"]:
            writer.writerow({
                "session_id": s["session_id"],
                "user_email": s["user_email"],
                "repo_name": s["repo_name"],
                "ai_provider": s["ai_provider"],
                "status": s["status"],
                "session_created_at": s["created_at"],
                "role": m["role"],
                "content": m["content"],
                "tokens_used": m["tokens_used"],
                "message_created_at": m["created_at"],
            })

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=chats.csv"},
    )


@router.get("/chats/{session_id}", response_model=AdminChatDetail, summary="Full session conversation")
async def get_chat_detail(
    session_id: UUID,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminChatDetail:
    s = await db.get(AnalysisSession, session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Session not found")

    u = await db.get(User, s.user_id)
    msgs = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at)
        )
    ).scalars().all()

    return AdminChatDetail(
        session_id=s.id,
        user_email=u.email if u else "deleted",
        user_name=u.name if u else None,
        repo_name=s.repo_name,
        repo_url=s.repo_url,
        ai_provider=s.ai_provider,
        status=s.status,
        messages=[
            AdminChatMessage(
                id=m.id,
                role=m.role,
                content=m.content,
                tokens_used=m.tokens_used,
                created_at=m.created_at,
            )
            for m in msgs
        ],
        created_at=s.created_at,
        completed_at=s.completed_at,
    )


# ── AI PROVIDERS ──────────────────────────────────────────────────────────────


def _is_key_configured(name: str) -> bool:
    return bool(getattr(settings, _PROVIDER_KEY_NAMES.get(name, ""), ""))


def _provider_test_response(result: dict[str, Any]) -> ProviderTestResponse:
    success = result.get("status") == "ok"
    return ProviderTestResponse(
        success=success,
        latency_ms=result.get("latency_ms"),
        message="OK" if success else result.get("error", "Failed"),
    )


@router.get("/ai/providers", summary="List all AI providers with stats")
async def list_ai_providers(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, ProviderStats]:
    ai_cfg = await _get_ai_settings(db)
    usage_row = await db.get(SystemSettings, "ai_usage_stats")
    usage: dict[str, Any] = usage_row.value if (usage_row and isinstance(usage_row.value, dict)) else {}
    disabled: list[str] = ai_cfg.get("disabled_providers", [])
    default_provider: str = ai_cfg.get("provider", "anthropic")

    result: dict[str, ProviderStats] = {}
    for name in FALLBACK_ORDER:
        provider_usage = usage.get(name, {})
        result[name] = ProviderStats(
            enabled=name not in disabled,
            is_default=(name == default_provider),
            api_key_configured=_is_key_configured(name),
            total_requests=provider_usage.get("total_requests", 0),
            total_cost_usd=provider_usage.get("total_cost_usd", 0.0),
            avg_response_time_ms=provider_usage.get("avg_response_time_ms"),
        )
    return result


@router.patch("/ai/providers/{name}", summary="Enable/disable a provider or set as default")
async def update_ai_provider(
    name: str,
    payload: ProviderUpdateRequest,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> ProviderStats:
    if name not in FALLBACK_ORDER:
        raise HTTPException(status_code=404, detail=f"Unknown provider '{name}'")

    ai_cfg = await _get_ai_settings(db)
    disabled: list[str] = list(ai_cfg.get("disabled_providers", []))
    changes: dict[str, Any] = {}

    if payload.enabled is not None:
        if payload.enabled and name in disabled:
            disabled.remove(name)
        elif not payload.enabled and name not in disabled:
            disabled.append(name)
        changes["enabled"] = payload.enabled

    if payload.is_default is True:
        ai_cfg["provider"] = name
        changes["is_default"] = True

    ai_cfg["disabled_providers"] = disabled
    await _save_ai_settings(db, admin, ai_cfg)
    await _audit(
        db, admin, "update_ai_provider",
        target_type="provider", target_id=name,
        details=changes, ip=_client_ip(request),
    )
    await db.commit()

    usage_row = await db.get(SystemSettings, "ai_usage_stats")
    usage = usage_row.value if (usage_row and isinstance(usage_row.value, dict)) else {}
    provider_usage = usage.get(name, {})
    return ProviderStats(
        enabled=name not in disabled,
        is_default=(ai_cfg.get("provider") == name),
        api_key_configured=_is_key_configured(name),
        total_requests=provider_usage.get("total_requests", 0),
        total_cost_usd=provider_usage.get("total_cost_usd", 0.0),
        avg_response_time_ms=provider_usage.get("avg_response_time_ms"),
    )


@router.post("/ai/providers/{name}/configure", summary="Store / update API key for a provider")
async def configure_provider(
    name: str,
    payload: ProviderConfigureRequest,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> ProviderTestResponse:
    if name not in FALLBACK_ORDER:
        raise HTTPException(status_code=404, detail=f"Unknown provider '{name}'")

    # Persist key in system_settings (plaintext — use a KMS/Vault in production)
    key_row = await db.get(SystemSettings, f"api_key_{name}")
    if key_row is None:
        key_row = SystemSettings(
            key=f"api_key_{name}",
            value={"api_key": payload.api_key},
            updated_by=admin.id,
        )
        db.add(key_row)
    else:
        key_row.value = {"api_key": payload.api_key}
        key_row.updated_by = admin.id

    # Quick connectivity test with new key injected at runtime
    env_var = _PROVIDER_KEY_NAMES.get(name, "")
    original = getattr(settings, env_var, "")
    setattr(settings, env_var, payload.api_key)
    try:
        ai = AIService(preferred_provider=name)
        result = await ai.test_provider(name)
    finally:
        setattr(settings, env_var, original)  # restore regardless of outcome

    await _audit(
        db, admin, "configure_provider",
        target_type="provider", target_id=name,
        details={"key_prefix": payload.api_key[:8] + "…"}, ip=_client_ip(request),
    )
    await db.commit()

    return _provider_test_response(result)


@router.post("/ai/test/{name}", response_model=ProviderTestResponse, summary="Test provider connectivity")
async def test_ai_provider(
    name: str,
    admin: User = Depends(get_current_admin_user),
) -> ProviderTestResponse:
    if name not in FALLBACK_ORDER:
        raise HTTPException(status_code=404, detail=f"Unknown provider '{name}'")

    ai = AIService(preferred_provider=name)
    result = await ai.test_provider(name)
    return _provider_test_response(result)


# ── SYSTEM SETTINGS ───────────────────────────────────────────────────────────

_SETTING_KEYS = {"rate_limits", "feature_flags", "ai_defaults", "security"}

_DEFAULT_SETTINGS: dict[str, Any] = {
    "rate_limits": {
        "repos_per_day": 3,
        "followups_per_session": 10,
        "requests_per_minute": 60,
    },
    "feature_flags": {
        "maintenance_mode": False,
        "new_registrations": True,
    },
    "ai_defaults": {
        "provider": "anthropic",
        "fallback_enabled": True,
        "disabled_providers": [],
    },
    "security": {
        "max_repo_size_mb": 500,
        "session_timeout_minutes": 30,
    },
}


@router.get("/settings", response_model=SystemSettingsResponse, summary="All system settings")
async def get_settings(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> SystemSettingsResponse:
    result: dict[str, Any] = {}
    for key, default in _DEFAULT_SETTINGS.items():
        row = await db.get(SystemSettings, key)
        result[key] = row.value if row else default
    return SystemSettingsResponse(**result)


@router.patch("/settings", response_model=SettingsPatchResponse, summary="Update a system setting")
async def patch_settings(
    payload: SettingsPatchRequest,
    request: Request,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> SettingsPatchResponse:
    # key must be one of the top-level setting buckets
    if payload.key not in _SETTING_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown setting key '{payload.key}'. Valid: {sorted(_SETTING_KEYS)}",
        )

    row = await db.get(SystemSettings, payload.key)
    if row is None:
        row = SystemSettings(key=payload.key, value=payload.value, updated_by=admin.id)
        db.add(row)
    else:
        row.value = payload.value
        row.updated_by = admin.id

    await _audit(
        db, admin, "update_settings",
        target_type="settings", target_id=payload.key,
        details={"value": payload.value}, ip=_client_ip(request),
    )
    await db.commit()
    await db.refresh(row)

    return SettingsPatchResponse(key=row.key, value=row.value, updated_at=row.updated_at)


# ── ANALYTICS ─────────────────────────────────────────────────────────────────


@router.get("/stats/overview", response_model=OverviewStats, summary="Dashboard overview stats")
async def stats_overview(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> OverviewStats:
    now = datetime.now(timezone.utc)
    cutoff_7d = now - timedelta(days=7)
    cutoff_24h = now - timedelta(hours=24)

    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    active_7d = (
        await db.execute(
            select(func.count(User.id)).where(User.last_login >= cutoff_7d)
        )
    ).scalar_one()
    total_analyses = (
        await db.execute(
            select(func.count(AnalysisSession.id)).where(AnalysisSession.status != "deleted")
        )
    ).scalar_one()
    analyses_24h = (
        await db.execute(
            select(func.count(AnalysisSession.id)).where(
                AnalysisSession.created_at >= cutoff_24h,
                AnalysisSession.status != "deleted",
            )
        )
    ).scalar_one()
    total_chats = (await db.execute(select(func.count(ChatMessage.id)))).scalar_one()

    # avg follow-ups = total assistant messages / total completed sessions
    completed_sessions = (
        await db.execute(
            select(func.count(AnalysisSession.id)).where(
                AnalysisSession.status == "completed"
            )
        )
    ).scalar_one()
    assistant_msgs = (
        await db.execute(
            select(func.count(ChatMessage.id)).where(ChatMessage.role == "assistant")
        )
    ).scalar_one()
    avg_followups = round(assistant_msgs / completed_sessions, 2) if completed_sessions else 0.0

    # AI requests in last 24 h = analyses + assistant messages in that window
    ai_24h_msgs = (
        await db.execute(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.created_at >= cutoff_24h,
                ChatMessage.role == "assistant",
            )
        )
    ).scalar_one()
    ai_requests_24h = analyses_24h + ai_24h_msgs

    return OverviewStats(
        total_users=total_users,
        active_users_7d=active_7d,
        total_analyses=total_analyses,
        analyses_24h=analyses_24h,
        total_chats=total_chats,
        avg_followups=avg_followups,
        ai_requests_24h=ai_requests_24h,
    )


@router.get("/stats/usage", response_model=UsageResponse, summary="Time-series usage data")
async def stats_usage(
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    group_by: Literal["day", "week", "month"] = "day",
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> UsageResponse:
    trunc = {"day": "day", "week": "week", "month": "month"}[group_by]
    df = date_from or (datetime.now(timezone.utc) - timedelta(days=30))
    dt = date_to or datetime.now(timezone.utc)

    # Analyses per period
    analysis_rows = (
        await db.execute(
            text(
                f"""
                SELECT date_trunc(:trunc, created_at AT TIME ZONE 'UTC') AS period,
                       COUNT(*) AS cnt
                FROM analysis_sessions
                WHERE created_at >= :df AND created_at <= :dt
                  AND status != 'deleted'
                GROUP BY 1 ORDER BY 1
                """
            ),
            {"trunc": trunc, "df": df, "dt": dt},
        )
    ).fetchall()

    # New users per period
    user_rows = (
        await db.execute(
            text(
                f"""
                SELECT date_trunc(:trunc, created_at AT TIME ZONE 'UTC') AS period,
                       COUNT(*) AS cnt
                FROM users
                WHERE created_at >= :df AND created_at <= :dt
                GROUP BY 1 ORDER BY 1
                """
            ),
            {"trunc": trunc, "df": df, "dt": dt},
        )
    ).fetchall()

    # Questions asked per period
    question_rows = (
        await db.execute(
            text(
                f"""
                SELECT date_trunc(:trunc, created_at AT TIME ZONE 'UTC') AS period,
                       COUNT(*) AS cnt
                FROM chat_messages
                WHERE created_at >= :df AND created_at <= :dt
                  AND role = 'user'
                GROUP BY 1 ORDER BY 1
                """
            ),
            {"trunc": trunc, "df": df, "dt": dt},
        )
    ).fetchall()

    # Provider breakdown
    provider_rows = (
        await db.execute(
            text(
                """
                SELECT ai_provider, COUNT(*) AS cnt
                FROM analysis_sessions
                WHERE created_at >= :df AND created_at <= :dt
                  AND status = 'completed'
                GROUP BY ai_provider
                """
            ),
            {"df": df, "dt": dt},
        )
    ).fetchall()

    # Merge into data points keyed by period
    analysis_map = {str(r.period): r.cnt for r in analysis_rows}
    user_map = {str(r.period): r.cnt for r in user_rows}
    question_map = {str(r.period): r.cnt for r in question_rows}
    all_periods = sorted(set(analysis_map) | set(user_map) | set(question_map))

    data = [
        UsageDataPoint(
            period=p,
            analyses=analysis_map.get(p, 0),
            new_users=user_map.get(p, 0),
            questions_asked=question_map.get(p, 0),
        )
        for p in all_periods
    ]

    return UsageResponse(
        group_by=group_by,
        data=data,
        provider_breakdown={r.ai_provider: r.cnt for r in provider_rows},
    )


@router.get("/stats/costs", response_model=CostsResponse, summary="AI cost breakdown by provider")
async def stats_costs(
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> CostsResponse:
    # Costs are approximated from the usage_stats stored in system_settings
    # (populated by ai_service.py when analyses complete — extend if needed)
    usage_row = await db.get(SystemSettings, "ai_usage_stats")
    usage: dict[str, Any] = usage_row.value if (usage_row and isinstance(usage_row.value, dict)) else {}

    # Cost-per-token table (input / output) per 1 000 tokens
    cost_table = {
        "anthropic": (0.003, 0.015),
        "openai": (0.01, 0.03),
        "gemini": (0.00025, 0.0005),
    }

    breakdown = []
    total = 0.0
    for name in FALLBACK_ORDER:
        p = usage.get(name, {})
        in_tok = p.get("total_input_tokens", 0)
        out_tok = p.get("total_output_tokens", 0)
        in_rate, out_rate = cost_table[name]
        cost = (in_tok * in_rate + out_tok * out_rate) / 1000
        total += cost
        breakdown.append(
            CostBreakdown(
                provider=name,
                total_requests=p.get("total_requests", 0),
                total_input_tokens=in_tok,
                total_output_tokens=out_tok,
                estimated_cost_usd=round(cost, 6),
            )
        )

    return CostsResponse(
        date_from=date_from,
        date_to=date_to,
        breakdown=breakdown,
        total_cost_usd=round(total, 6),
    )


# ── AUDIT LOG ─────────────────────────────────────────────────────────────────


@router.get("/audit", response_model=AuditLogListResponse, summary="Admin action audit trail")
async def list_audit_logs(
    action_type: str | None = None,
    admin_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    stmt = select(AuditLog)
    if action_type:
        stmt = stmt.where(AuditLog.action == action_type)
    if admin_id:
        stmt = stmt.where(AuditLog.admin_id == admin_id)
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditLog.created_at <= date_to)

    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()
    rows = (
        await db.execute(stmt.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit))
    ).scalars().all()

    items = []
    for log in rows:
        actor = await db.get(User, log.admin_id) if log.admin_id else None
        items.append(
            AuditLogEntry(
                id=log.id,
                admin_email=actor.email if actor else None,
                admin_name=actor.name if actor else None,
                action=log.action,
                target_type=log.target_type,
                target_id=log.target_id,
                details=log.details,
                ip_address=log.ip_address,
                created_at=log.created_at,
            )
        )

    return AuditLogListResponse(items=items, total=total, skip=skip, limit=limit)
