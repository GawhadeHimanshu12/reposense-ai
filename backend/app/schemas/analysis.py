import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


# ── Analysis Session ──────────────────────────────────────────────────────────

class AnalysisSessionCreate(BaseModel):
    repo_url: str
    ai_provider: str = "anthropic"


class AnalyzeRequest(BaseModel):
    repo_url: str

    @field_validator("repo_url")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip()


class AnalyzeResponse(BaseModel):
    session_id: uuid.UUID
    status: str


class AnalysisDetail(BaseModel):
    summary: str | None = None
    tech_stack: dict[str, Any] | None = None
    architecture: dict[str, Any] | None = None
    code_quality: dict[str, Any] | None = None
    security: dict[str, Any] | None = None
    performance: dict[str, Any] | None = None
    scalability: dict[str, Any] | None = None
    recommendations: list[str] | None = None
    complexity_score: int | None = None
    complexity_explanation: str | None = None
    code_quality_score: int | None = None
    security_score: int | None = None
    maintainability_score: int | None = None


class AnalysisSessionResponse(BaseModel):
    session_id: uuid.UUID
    status: str
    repo_url: str
    repo_name: str
    repo_data: dict[str, Any] | None = None
    analysis: AnalysisDetail | None = None
    ai_provider: str
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class AnalysisSessionSummary(BaseModel):
    """Lightweight list-view — omits large JSONB blobs."""

    session_id: uuid.UUID
    repo_name: str
    repo_url: str
    ai_provider: str
    status: str
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class RateLimitBucketDetail(BaseModel):
    used: int
    limit: int
    remaining: int
    resets_at: datetime | None = None


class RepoRateLimitResponse(BaseModel):
    repo_analysis: RateLimitBucketDetail


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatMessageCreate(BaseModel):
    content: str


class SendMessageRequest(BaseModel):
    message: str

    @field_validator("message")
    @classmethod
    def validate_length(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty")
        if len(v) > 1000:
            raise ValueError("Message exceeds 1000 character limit")
        return v


class SendMessageResponse(BaseModel):
    message_id: uuid.UUID
    response: str
    follow_up_suggestions: list[str]
    followup_count: int
    followups_remaining: int


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str
    tokens_used: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatHistoryResponse(BaseModel):
    messages: list[ChatMessageResponse]


class FollowupRemainingResponse(BaseModel):
    used: int
    remaining: int
    limit: int
