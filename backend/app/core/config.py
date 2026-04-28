from typing import List

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── App ──────────────────────────────────────────────────────────────
    APP_NAME: str = "RepoSense AI"
    APP_ENV: str = "development"
    ENVIRONMENT: str = ""
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # ── Server ───────────────────────────────────────────────────────────
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v: object) -> list[str]:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",")]
        return v  # type: ignore[return-value]

    # ── JWT ───────────────────────────────────────────────────────────────
    # Primary secret used to sign access tokens.
    SECRET_KEY: str = ""
    # Backward/alternate name for SECRET_KEY
    JWT_SECRET_KEY: str = ""
    # Separate secret for refresh tokens — rotate independently if compromised.
    REFRESH_TOKEN_SECRET: str = ""      # falls back to SECRET_KEY when empty
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    @property
    def effective_refresh_secret(self) -> str:
        return self.REFRESH_TOKEN_SECRET or self.SECRET_KEY

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def ensure_asyncpg(cls, v: object) -> object:
        if isinstance(v, str):
            if v.startswith("postgres://"):
                v = v.replace("postgres://", "postgresql://", 1)
            if v.startswith("postgresql://") and "+asyncpg" not in v:
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # ── Redis ─────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    # TTL for blocklisted (logged-out) access tokens.  Must be >= ACCESS_TOKEN_EXPIRE_MINUTES.
    BLOCKLIST_TTL_SECONDS: int = 60 * 60 * 24  # 24 h

    # ── GitHub API ────────────────────────────────────────────────────────
    GITHUB_TOKEN: str = ""          # server-side PAT for public-repo analysis

    # ── Cloudflare Turnstile ──────────────────────────────────────────────
    TURNSTILE_SECRET_KEY: str = ""  # leave empty to skip CAPTCHA in dev

    # ── GitHub OAuth ──────────────────────────────────────────────────────
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_CALLBACK_URL: str = "http://localhost:8000/api/v1/auth/github/callback"

    # ── Google OAuth ──────────────────────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_CALLBACK_URL: str = "http://localhost:8000/api/v1/auth/google/callback"
    # Used for server-side authorization-code flow (optional – ID-token flow uses GOOGLE_CLIENT_ID only)
    GOOGLE_TOKEN_ENDPOINT: str = "https://oauth2.googleapis.com/token"
    GOOGLE_USERINFO_ENDPOINT: str = "https://openidconnect.googleapis.com/v1/userinfo"

    # ── AI Providers ──────────────────────────────────────────────────────
    GOOGLE_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    @model_validator(mode="after")
    def finalize_settings(self) -> "Settings":
        if not self.SECRET_KEY:
            if self.JWT_SECRET_KEY:
                self.SECRET_KEY = self.JWT_SECRET_KEY
            else:
                raise ValueError("SECRET_KEY or JWT_SECRET_KEY must be set")
        if self.ENVIRONMENT:
            self.APP_ENV = self.ENVIRONMENT
        if not self.GEMINI_API_KEY and self.GOOGLE_API_KEY:
            self.GEMINI_API_KEY = self.GOOGLE_API_KEY
        return self

    # ── Admin ─────────────────────────────────────────────────────────────
    ADMIN_EMAIL: str = ""  # the single account that is always admin

    # ── Rate limiting ─────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_REPO_ANALYSIS_PER_DAY: int = 10
    RATE_LIMIT_FOLLOWUP_PER_DAY: int = 50


settings = Settings()
