"""
Follow-up chat endpoints for a completed analysis session.

POST /chat/{session_id}/message   — send a follow-up question
GET  /chat/{session_id}/history   — fetch full conversation history
GET  /chat/{session_id}/remaining — how many follow-ups are left
"""

from __future__ import annotations

import uuid

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.core.redis import get_redis
from app.db.models.analysis_session import AnalysisSession, ChatMessage, MessageRole, SessionStatus
from app.db.models.user import User
from app.schemas.analysis import (
    ChatHistoryResponse,
    ChatMessageResponse,
    FollowupRemainingResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from app.services.security_service import sanitize_text_input

router = APIRouter()
logger = structlog.get_logger()

_FOLLOWUP_LIMIT = 10
_FOLLOWUP_KEY = "followup:session:{session_id}"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_completed_session(
    session_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> AnalysisSession:
    obj = await db.get(AnalysisSession, session_id)
    if obj is None or obj.status == "deleted":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if obj.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if obj.status != SessionStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Analysis is not completed yet (status: {obj.status})",
        )
    return obj


async def _get_followup_count(redis: aioredis.Redis, session_id: uuid.UUID) -> int:
    key = _FOLLOWUP_KEY.format(session_id=session_id)
    raw = await redis.get(key)
    return int(raw) if raw else 0


async def _increment_followup(redis: aioredis.Redis, session_id: uuid.UUID) -> int:
    key = _FOLLOWUP_KEY.format(session_id=session_id)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 86_400 * 30)  # keep for 30 days
    return count


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post(
    "/{session_id}/message",
    response_model=SendMessageResponse,
    summary="Send a follow-up question about the analysis",
)
async def send_message(
    session_id: uuid.UUID,
    payload: SendMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> SendMessageResponse:
    session = await _get_completed_session(session_id, user, db)

    # ── Per-session follow-up limit ───────────────────────────────────────────
    followup_count = await _get_followup_count(redis, session_id)
    if followup_count >= _FOLLOWUP_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Follow-up limit ({_FOLLOWUP_LIMIT}) reached for this session",
        )

    # ── Sanitise input ────────────────────────────────────────────────────────
    clean_message = sanitize_text_input(payload.message, max_length=1000)

    # ── Load conversation history ─────────────────────────────────────────────
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    history_rows = (await db.execute(stmt)).scalars().all()
    history = [{"role": m.role, "content": m.content} for m in history_rows]

    # ── Persist user message ──────────────────────────────────────────────────
    user_msg = ChatMessage(
        session_id=session_id,
        user_id=user.id,
        role=MessageRole.USER,
        content=clean_message,
    )
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    # ── Call AI service ───────────────────────────────────────────────────────
    from app.services.ai_service import AIService, AllProvidersFailedError

    try:
        ai = AIService(preferred_provider=session.ai_provider)
        chat_result = await ai.chat(
            question=clean_message,
            repo_context=session.repo_data or {},
            analysis_summary=session.analysis_result or {},
            history=history,
        )
    except AllProvidersFailedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI service unavailable: {exc}",
        )

    # ── Persist AI response ───────────────────────────────────────────────────
    ai_msg = ChatMessage(
        session_id=session_id,
        user_id=user.id,
        role=MessageRole.ASSISTANT,
        content=chat_result.answer,
        tokens_used=(
            chat_result.usage.input_tokens + chat_result.usage.output_tokens
            if chat_result.usage
            else None
        ),
    )
    db.add(ai_msg)
    await db.commit()
    await db.refresh(ai_msg)

    # ── Increment counter ─────────────────────────────────────────────────────
    new_count = await _increment_followup(redis, session_id)

    logger.info(
        "Follow-up answered",
        session_id=str(session_id),
        user_id=str(user.id),
        followup_count=new_count,
    )

    return SendMessageResponse(
        message_id=ai_msg.id,
        response=chat_result.answer,
        follow_up_suggestions=chat_result.follow_up_suggestions,
        followup_count=new_count,
        followups_remaining=max(0, _FOLLOWUP_LIMIT - new_count),
    )


@router.get(
    "/{session_id}/history",
    response_model=ChatHistoryResponse,
    summary="Fetch full conversation history for a session",
)
async def get_history(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatHistoryResponse:
    # Verify ownership (session need not be completed to view history)
    obj = await db.get(AnalysisSession, session_id)
    if obj is None or obj.status == "deleted":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if obj.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    rows = (await db.execute(stmt)).scalars().all()

    return ChatHistoryResponse(
        messages=[
            ChatMessageResponse(
                id=m.id,
                session_id=m.session_id,
                role=m.role,
                content=m.content,
                tokens_used=m.tokens_used,
                created_at=m.created_at,
            )
            for m in rows
        ]
    )


@router.get(
    "/{session_id}/remaining",
    response_model=FollowupRemainingResponse,
    summary="How many follow-up questions remain for this session",
)
async def followup_remaining(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> FollowupRemainingResponse:
    obj = await db.get(AnalysisSession, session_id)
    if obj is None or obj.status == "deleted":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if obj.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    used = await _get_followup_count(redis, session_id)
    return FollowupRemainingResponse(
        used=used,
        remaining=max(0, _FOLLOWUP_LIMIT - used),
        limit=_FOLLOWUP_LIMIT,
    )
