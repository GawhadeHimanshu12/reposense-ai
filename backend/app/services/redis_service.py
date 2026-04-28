"""
Higher-level Redis operations built on top of the raw client in core/redis.py.

Four concerns:
  RateLimiter      — sliding-window rate limiting (more accurate than fixed INCR)
  GitHubCache      — transparent cache for GitHub API responses (1 h TTL)
  SessionManager   — lightweight KV store for analysis-session state
  UserTracker      — last-seen timestamps and active-session counting
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis
import structlog

logger = structlog.get_logger()

# Key prefixes — keep in one place so nothing collides
_PFX_RL = "rl"          # rate limit
_PFX_GH = "ghcache"     # GitHub API cache
_PFX_SES = "session"    # analysis session state
_PFX_USR = "user"       # user tracking


# ── RateLimiter ───────────────────────────────────────────────────────────────

class RateLimiter:
    """
    Sliding-window rate limiter backed by a Redis sorted set.

    Each allowed request scores one member (timestamp:nano) in a ZSET.
    Members older than `window_seconds` are pruned on every call.
    This gives accurate per-window counts regardless of when requests arrive.
    """

    def __init__(self, redis: aioredis.Redis):
        self._r = redis

    async def is_allowed(
        self,
        key: str,
        limit: int,
        window_seconds: int,
        *,
        admin_bypass: bool = False,
    ) -> tuple[bool, int]:
        """
        Check and record a request attempt.

        Returns (allowed, remaining_count).
        If admin_bypass is True, always returns (True, limit).
        """
        if admin_bypass:
            return True, limit

        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        window_start_ms = now_ms - window_seconds * 1000
        full_key = f"{_PFX_RL}:{key}"

        pipe = self._r.pipeline(transaction=True)
        # Remove expired members
        pipe.zremrangebyscore(full_key, 0, window_start_ms)
        # Count remaining
        pipe.zcard(full_key)
        # Add current request
        member = f"{now_ms}:{id(object())}"  # unique member
        pipe.zadd(full_key, {member: now_ms})
        # Set TTL slightly beyond window so key auto-expires
        pipe.expire(full_key, window_seconds + 10)
        results = await pipe.execute()

        current_count: int = results[1]  # count BEFORE this request
        allowed = current_count < limit
        remaining = max(0, limit - current_count - 1) if allowed else 0

        if not allowed:
            logger.info("Rate limit exceeded", key=key, count=current_count, limit=limit)

        return allowed, remaining

    async def get_count(self, key: str, window_seconds: int) -> int:
        """Return current request count in the window without recording a new one."""
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        window_start_ms = now_ms - window_seconds * 1000
        full_key = f"{_PFX_RL}:{key}"
        await self._r.zremrangebyscore(full_key, 0, window_start_ms)
        return await self._r.zcard(full_key)

    async def reset(self, key: str) -> None:
        """Clear all rate-limit records for this key (admin use)."""
        await self._r.delete(f"{_PFX_RL}:{key}")

    # Named limit presets ────────────────────────────────────────────────

    async def check_repo_analysis(
        self, user_id: str, *, admin_bypass: bool = False
    ) -> tuple[bool, int]:
        """3 repo analyses per user per 24 h."""
        return await self.is_allowed(
            f"repo_analysis:{user_id}",
            limit=3,
            window_seconds=86_400,
            admin_bypass=admin_bypass,
        )

    async def check_followup(
        self, session_id: str, *, admin_bypass: bool = False
    ) -> tuple[bool, int]:
        """10 follow-up questions per analysis session."""
        return await self.is_allowed(
            f"followup:{session_id}",
            limit=10,
            window_seconds=86_400,
            admin_bypass=admin_bypass,
        )

    async def check_ip(self, ip: str, *, admin_bypass: bool = False) -> tuple[bool, int]:
        """100 API requests per IP per hour (DDoS prevention)."""
        return await self.is_allowed(
            f"ip:{ip}",
            limit=100,
            window_seconds=3_600,
            admin_bypass=admin_bypass,
        )

    async def get_status(self, user_id: str) -> dict[str, Any]:
        """Return current counts for all rate-limit buckets for a user."""
        repo_count = await self.get_count(f"repo_analysis:{user_id}", 86_400)
        followup_count = await self.get_count(f"followup:{user_id}", 86_400)
        return {
            "repo_analysis": {"used": repo_count, "limit": 3, "window": "24h"},
            "followup": {"used": followup_count, "limit": 10, "window": "24h"},
        }


# ── GitHubCache ───────────────────────────────────────────────────────────────

_GITHUB_CACHE_TTL = 3600  # 1 hour


class GitHubCache:
    """
    Transparent cache layer for GitHub API responses.

    Keys: ghcache:{owner}:{repo}:{endpoint}
    Values: JSON-serialised response payload.
    TTL: 1 hour (configurable via `ttl` parameter).
    """

    def __init__(self, redis: aioredis.Redis, ttl: int = _GITHUB_CACHE_TTL):
        self._r = redis
        self._ttl = ttl

    def _key(self, owner: str, repo: str, endpoint: str) -> str:
        return f"{_PFX_GH}:{owner.lower()}:{repo.lower()}:{endpoint}"

    async def get(self, owner: str, repo: str, endpoint: str) -> Any | None:
        raw = await self._r.get(self._key(owner, repo, endpoint))
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    async def set(
        self, owner: str, repo: str, endpoint: str, data: Any, ttl: int | None = None
    ) -> None:
        key = self._key(owner, repo, endpoint)
        await self._r.setex(key, ttl or self._ttl, json.dumps(data, default=str))

    async def invalidate(self, owner: str, repo: str) -> int:
        """Delete all cached entries for a repository. Returns number of keys deleted."""
        pattern = f"{_PFX_GH}:{owner.lower()}:{repo.lower()}:*"
        keys = await self._r.keys(pattern)
        if keys:
            return await self._r.delete(*keys)
        return 0

    async def get_or_fetch(
        self,
        owner: str,
        repo: str,
        endpoint: str,
        fetch_fn,  # async callable () -> Any
        ttl: int | None = None,
    ) -> Any:
        """Return cached value or call fetch_fn, cache result, and return it."""
        cached = await self.get(owner, repo, endpoint)
        if cached is not None:
            logger.debug("GitHub cache hit", owner=owner, repo=repo, endpoint=endpoint)
            return cached
        data = await fetch_fn()
        await self.set(owner, repo, endpoint, data, ttl)
        return data


# ── SessionManager ────────────────────────────────────────────────────────────

_SESSION_TTL = 7 * 86_400  # 7 days


class SessionManager:
    """
    Lightweight KV store for analysis session state in Redis.

    Stores arbitrary JSON payloads keyed by session UUID.
    TTL: 7 days (refreshed on every write).
    """

    def __init__(self, redis: aioredis.Redis, ttl: int = _SESSION_TTL):
        self._r = redis
        self._ttl = ttl

    def _key(self, session_id: str) -> str:
        return f"{_PFX_SES}:{session_id}"

    async def get(self, session_id: str) -> dict[str, Any] | None:
        raw = await self._r.get(self._key(session_id))
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    async def set(self, session_id: str, data: dict[str, Any]) -> None:
        await self._r.setex(self._key(session_id), self._ttl, json.dumps(data, default=str))

    async def update(self, session_id: str, updates: dict[str, Any]) -> None:
        existing = await self.get(session_id) or {}
        existing.update(updates)
        await self.set(session_id, existing)

    async def delete(self, session_id: str) -> None:
        await self._r.delete(self._key(session_id))

    async def exists(self, session_id: str) -> bool:
        return bool(await self._r.exists(self._key(session_id)))


# ── UserTracker ───────────────────────────────────────────────────────────────

class UserTracker:
    """
    Track per-user activity for analytics and abuse detection.

    Stores:
      user:{id}:last_seen   — ISO timestamp of last request
      user:{id}:sessions    — ZSET of active session IDs (scored by last-active ts)
    """

    def __init__(self, redis: aioredis.Redis):
        self._r = redis

    async def record_activity(self, user_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        await self._r.setex(f"{_PFX_USR}:{user_id}:last_seen", 86_400 * 30, now)

    async def get_last_seen(self, user_id: str) -> str | None:
        return await self._r.get(f"{_PFX_USR}:{user_id}:last_seen")

    async def add_active_session(self, user_id: str, session_id: str) -> None:
        score = datetime.now(timezone.utc).timestamp()
        key = f"{_PFX_USR}:{user_id}:sessions"
        await self._r.zadd(key, {session_id: score})
        await self._r.expire(key, 86_400 * 30)

    async def get_active_sessions(self, user_id: str) -> list[str]:
        key = f"{_PFX_USR}:{user_id}:sessions"
        return await self._r.zrange(key, 0, -1)

    async def remove_session(self, user_id: str, session_id: str) -> None:
        await self._r.zrem(f"{_PFX_USR}:{user_id}:sessions", session_id)
