"""
Security endpoints.

GET  /security/check-limits   — return the authenticated user's current rate-limit status
POST /security/validate-url   — validate a GitHub URL before submitting it for analysis
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

import structlog

from app.core.deps import get_current_user, get_redis
from app.db.models.user import User
from app.services.redis_service import RateLimiter
from app.services.security_service import (
    BotCheckResult,
    URLValidationResult,
    check_bot_signals,
    sanitize_url_input,
    validate_github_url,
)

router = APIRouter()
logger = structlog.get_logger()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ValidateURLRequest(BaseModel):
    url: str
    turnstile_token: str | None = None


class ValidateURLResponse(BaseModel):
    valid: bool
    owner: str | None = None
    repo: str | None = None
    error: str | None = None


class RateLimitBucket(BaseModel):
    used: int
    limit: int
    window: str


class CheckLimitsResponse(BaseModel):
    user_id: str
    is_admin: bool
    repo_analysis: RateLimitBucket
    followup: RateLimitBucket


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/check-limits", response_model=CheckLimitsResponse)
async def check_limits(
    user: User = Depends(get_current_user),
    redis=Depends(get_redis),
) -> CheckLimitsResponse:
    """
    Return the current rate-limit consumption for the authenticated user.

    Admins see their own counts but are never blocked by rate limits.
    """
    limiter = RateLimiter(redis)
    status_data = await limiter.get_status(str(user.id))

    logger.info("Rate limit status checked", user_id=str(user.id))

    return CheckLimitsResponse(
        user_id=str(user.id),
        is_admin=user.is_admin,
        repo_analysis=RateLimitBucket(**status_data["repo_analysis"]),
        followup=RateLimitBucket(**status_data["followup"]),
    )


@router.post("/validate-url", response_model=ValidateURLResponse)
async def validate_url(
    payload: ValidateURLRequest,
    request: Request,
    user: User = Depends(get_current_user),
    redis=Depends(get_redis),
) -> ValidateURLResponse:
    """
    Validate a GitHub repository URL.

    Performs:
    1. Per-IP rate limiting (100 req/h)
    2. Bot signal detection from request headers
    3. URL sanitisation and whitelist validation
    4. Optional Cloudflare Turnstile verification

    Returns a structured result indicating whether the URL is valid and,
    if so, the parsed owner and repository name.
    """
    client_ip = _get_client_ip(request)

    # IP-level rate limit
    if not user.is_admin:
        limiter = RateLimiter(redis)
        allowed, remaining = await limiter.check_ip(client_ip)
        if not allowed:
            logger.warning("IP rate limit exceeded on validate-url", ip=client_ip)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests from this IP — try again later",
            )

    # Bot detection
    bot_result: BotCheckResult = check_bot_signals(
        user_agent=request.headers.get("user-agent"),
        honeypot_value=None,  # honeypot is in the form layer, not the JSON body
        extra_headers={
            "accept": request.headers.get("accept", ""),
            "accept-language": request.headers.get("accept-language", ""),
        },
    )
    if bot_result.is_bot:
        logger.warning(
            "Bot signal on validate-url",
            reason=bot_result.reason,
            ip=client_ip,
            user_id=str(user.id),
        )
        # Soft block: return invalid rather than 403 to avoid leaking the check
        return ValidateURLResponse(valid=False, error="Request blocked — please try again")

    # Turnstile verification (optional — only if token was provided)
    if payload.turnstile_token:
        from app.services.security_service import verify_turnstile_token

        ok = await verify_turnstile_token(payload.turnstile_token, remote_ip=client_ip)
        if not ok:
            return ValidateURLResponse(valid=False, error="CAPTCHA verification failed")

    # Sanitise and validate
    clean_url = sanitize_url_input(payload.url)
    result: URLValidationResult = validate_github_url(clean_url)

    if result.valid:
        logger.info(
            "URL validated",
            owner=result.owner,
            repo=result.repo,
            user_id=str(user.id),
        )
    else:
        logger.info(
            "URL rejected",
            error=result.error,
            url=clean_url[:100],
            user_id=str(user.id),
        )

    return ValidateURLResponse(
        valid=result.valid,
        owner=result.owner,
        repo=result.repo,
        error=result.error,
    )
