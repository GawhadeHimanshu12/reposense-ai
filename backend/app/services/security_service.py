"""
Security service — URL validation, input sanitisation, malicious-content
detection, bot-protection helpers, and CAPTCHA verification stub.

All functions are pure (no I/O) unless they call an external API
(verify_turnstile_token).  Redis rate-limiting lives in redis_service.py.
"""

from __future__ import annotations

import html
import ipaddress
import re
import socket
from dataclasses import dataclass
from typing import Any

import structlog

logger = structlog.get_logger()


# ── URL validation ────────────────────────────────────────────────────────────

_ALLOWED_HOST = "github.com"
_BLOCKED_SCHEMES = {"javascript", "data", "file", "ftp", "blob", "vbscript"}
_PATH_TRAVERSAL_RE = re.compile(r"\.\.[/\\]")
_GITHUB_REPO_RE = re.compile(
    r"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#].*)?$"
)


@dataclass
class URLValidationResult:
    valid: bool
    owner: str | None = None
    repo: str | None = None
    error: str | None = None


def validate_github_url(raw_url: str) -> URLValidationResult:
    """
    Full whitelist-based URL validation.

    Checks:
    - HTTPS scheme only
    - Host must be exactly github.com (no subdomains)
    - No blocked schemes (javascript:, data:, etc.)
    - No path-traversal sequences (../ or ..\\)
    - Host must not be an IP address
    - URL must match the owner/repo pattern
    """
    url = raw_url.strip()

    if not url:
        return URLValidationResult(valid=False, error="URL is empty")

    # Blocked scheme check (before any parsing)
    scheme_prefix = url.split(":")[0].lower()
    if scheme_prefix in _BLOCKED_SCHEMES:
        logger.warning("Blocked scheme in URL", scheme=scheme_prefix)
        return URLValidationResult(valid=False, error=f"Scheme '{scheme_prefix}:' is not allowed")

    if not url.lower().startswith("https://"):
        return URLValidationResult(valid=False, error="Only HTTPS URLs are accepted")

    # Path traversal
    if _PATH_TRAVERSAL_RE.search(url):
        logger.warning("Path traversal attempt in URL", url=url)
        return URLValidationResult(valid=False, error="URL contains path traversal sequences")

    # Extract host
    try:
        after_scheme = url[len("https://"):]
        host_part = after_scheme.split("/")[0].split("?")[0].split("#")[0].lower()
        # Strip port if present
        host = host_part.split(":")[0]
    except Exception:
        return URLValidationResult(valid=False, error="Malformed URL")

    # Block IP addresses
    try:
        ipaddress.ip_address(host)
        return URLValidationResult(valid=False, error="IP addresses are not allowed; use a domain name")
    except ValueError:
        pass  # Not an IP — good

    # Whitelist: must be github.com (no subdomains, no lookalikes)
    if host != _ALLOWED_HOST:
        return URLValidationResult(
            valid=False,
            error=f"Only github.com URLs are accepted (got '{host}')",
        )

    # Null bytes and control characters
    if any(ord(c) < 32 for c in url):
        return URLValidationResult(valid=False, error="URL contains invalid control characters")

    # Match owner/repo pattern
    m = _GITHUB_REPO_RE.match(url)
    if not m:
        return URLValidationResult(
            valid=False,
            error="URL does not match the expected GitHub repository format "
                  "(https://github.com/owner/repo)",
        )

    owner, repo = m.group(1), m.group(2)

    # Reject dot-only names
    if not owner.strip(".") or not repo.strip("."):
        return URLValidationResult(valid=False, error="Owner or repository name is invalid")

    return URLValidationResult(valid=True, owner=owner, repo=repo)


# ── Malicious content detection ───────────────────────────────────────────────

_SUSPICIOUS_NAME_RE = re.compile(
    r"[;&|`$(){}<>!\[\]\\'\"]|\.{3,}|\s{2,}|%[0-9a-fA-F]{2}"
)
_HARMFUL_EXTENSIONS = {
    ".exe", ".dll", ".bat", ".cmd", ".com", ".scr", ".pif",
    ".vbs", ".vbe", ".js_", ".jse", ".wsf", ".wsh",
    ".ps1", ".psm1", ".psd1",
    ".msi", ".msp", ".msc",
    ".hta",
}
_MAX_REPO_SIZE_KB = 500 * 1024  # 500 MB


@dataclass
class ContentScanResult:
    safe: bool
    warnings: list[str]
    blocked: bool = False
    block_reason: str | None = None


def scan_repo_metadata(
    repo_name: str,
    size_kb: int,
    file_tree: list[str],
) -> ContentScanResult:
    """
    Inspect repository metadata and file list for red flags.
    Returns a ContentScanResult; blocked=True means we refuse to analyse.
    """
    warnings: list[str] = []

    # Suspicious characters in repo name
    if _SUSPICIOUS_NAME_RE.search(repo_name):
        logger.warning("Suspicious repo name", name=repo_name)
        return ContentScanResult(
            safe=False,
            warnings=[f"Repository name contains suspicious characters: {repo_name!r}"],
            blocked=True,
            block_reason="Suspicious repository name",
        )

    # Size check
    if size_kb > _MAX_REPO_SIZE_KB:
        return ContentScanResult(
            safe=False,
            warnings=[f"Repository size {size_kb // 1024} MB exceeds 500 MB limit"],
            blocked=True,
            block_reason="Repository too large",
        )

    # Harmful file types
    harmful = [
        p for p in file_tree
        if ("." + p.rsplit(".", 1)[-1].lower()) in _HARMFUL_EXTENSIONS
        if "." in p
    ]
    if harmful:
        sample = harmful[:5]
        warnings.append(f"Repository contains potentially harmful file types: {sample}")

    # Fork bomb / recursive pattern: absurdly deep nesting
    max_depth = max((p.count("/") for p in file_tree), default=0)
    if max_depth > 20:
        warnings.append(f"Unusually deep directory nesting detected (depth {max_depth})")

    # Extremely large file count
    if len(file_tree) >= 1000:
        warnings.append("Repository has 1000+ files (tree was truncated)")

    return ContentScanResult(safe=not warnings, warnings=warnings)


# ── Input sanitisation ────────────────────────────────────────────────────────

_NULL_BYTE_RE = re.compile(r"\x00")
_SQL_INJECTION_RE = re.compile(
    r"(--|;|/\*|\*/|xp_|EXEC\s+|EXECUTE\s+|UNION\s+SELECT|DROP\s+TABLE|INSERT\s+INTO"
    r"|DELETE\s+FROM|UPDATE\s+\w+\s+SET)",
    re.IGNORECASE,
)
_MAX_INPUT_LENGTH = 4096


def sanitize_text_input(raw: str, max_length: int = _MAX_INPUT_LENGTH) -> str:
    """
    Sanitise free-text user input (chat messages, descriptions).

    - Strips null bytes
    - Truncates to max_length
    - HTML-escapes special characters (prevents XSS in rendered output)
    - Does NOT strip the string; leading/trailing whitespace may be meaningful
    """
    if not isinstance(raw, str):
        raw = str(raw)

    # Null bytes
    raw = _NULL_BYTE_RE.sub("", raw)

    # Truncate
    raw = raw[:max_length]

    # HTML escape — prevents XSS when content is reflected in HTML context
    raw = html.escape(raw, quote=True)

    return raw


def sanitize_url_input(raw: str) -> str:
    """Sanitise a URL input: strip whitespace, null bytes, limit length."""
    raw = _NULL_BYTE_RE.sub("", raw.strip())[:2048]
    return raw


def detect_sql_injection(value: str) -> bool:
    """Return True if the string looks like a SQL injection attempt."""
    return bool(_SQL_INJECTION_RE.search(value))


# ── Bot protection ────────────────────────────────────────────────────────────

_BOT_UA_RE = re.compile(
    r"(bot|crawler|spider|scraper|curl|wget|python-requests|go-http|java/|"
    r"libwww-perl|mechanize|scrapy)",
    re.IGNORECASE,
)
_REQUIRED_UA_PARTS = re.compile(r"(Mozilla|Chrome|Safari|Firefox|Edge)", re.IGNORECASE)

_HONEYPOT_FIELD = "website"  # name of the honeypot form field


@dataclass
class BotCheckResult:
    is_bot: bool
    reason: str | None = None
    fingerprint: str | None = None


def check_bot_signals(
    user_agent: str | None,
    honeypot_value: str | None = None,
    extra_headers: dict[str, str] | None = None,
) -> BotCheckResult:
    """
    Lightweight bot detection based on User-Agent, honeypot field, and headers.

    Not a hard block on its own — combine with CAPTCHA for sensitive actions.
    """
    ua = (user_agent or "").strip()

    # Empty user-agent
    if not ua:
        return BotCheckResult(is_bot=True, reason="Missing User-Agent")

    # Known bot user-agents
    if _BOT_UA_RE.search(ua):
        return BotCheckResult(is_bot=True, reason=f"Bot-like User-Agent: {ua[:80]}")

    # Missing browser markers (all real browsers include these)
    if not _REQUIRED_UA_PARTS.search(ua):
        return BotCheckResult(is_bot=True, reason="User-Agent lacks browser signature")

    # Honeypot: real browsers leave this blank; bots fill it in
    if honeypot_value:
        return BotCheckResult(is_bot=True, reason="Honeypot field was filled")

    # Build a simple fingerprint from stable headers
    headers = extra_headers or {}
    accept = headers.get("accept", "")
    lang = headers.get("accept-language", "")
    fingerprint = f"{ua[:64]}|{accept[:32]}|{lang[:16]}"

    return BotCheckResult(is_bot=False, fingerprint=fingerprint)


def is_honeypot_triggered(form_data: dict[str, Any]) -> bool:
    """Return True if the honeypot field is non-empty in submitted form data."""
    return bool(form_data.get(_HONEYPOT_FIELD, ""))


# ── Cloudflare Turnstile CAPTCHA ──────────────────────────────────────────────

_TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile_token(token: str, remote_ip: str | None = None) -> bool:
    """
    Verify a Cloudflare Turnstile token with the siteverify API.

    Returns True on success.  Returns False (not raises) on failure so callers
    can decide whether to hard-block or just log.

    Requires TURNSTILE_SECRET_KEY to be set in settings.  If not configured,
    always returns True (CAPTCHA bypass for local development).
    """
    import httpx

    secret = getattr(__import__("app.core.config", fromlist=["settings"]).settings,
                     "TURNSTILE_SECRET_KEY", "")
    if not secret:
        logger.debug("Turnstile secret not configured — skipping CAPTCHA verification")
        return True

    payload: dict[str, str] = {"secret": secret, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(_TURNSTILE_VERIFY_URL, data=payload)
            data = resp.json()
            success = bool(data.get("success"))
            if not success:
                logger.warning("Turnstile verification failed", error_codes=data.get("error-codes"))
            return success
    except Exception as exc:
        logger.error("Turnstile verification request failed", error=str(exc))
        return False
