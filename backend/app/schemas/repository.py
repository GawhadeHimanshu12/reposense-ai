import uuid
from datetime import datetime

from pydantic import BaseModel, HttpUrl


class RepositoryCreate(BaseModel):
    full_name: str
    html_url: str


class RepositoryResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    name: str
    description: str | None = None
    html_url: str
    language: str | None = None
    stars: int
    forks: int
    open_issues: int
    is_private: bool
    topics: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class AnalysisInsightResponse(BaseModel):
    id: uuid.UUID
    category: str
    severity: str
    title: str
    description: str
    file_path: str | None = None
    line_number: int | None = None

    model_config = {"from_attributes": True}


class RepositoryAnalysisResponse(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    status: str
    ai_provider: str
    summary: str | None = None
    code_quality_score: int | None = None
    security_score: int | None = None
    maintainability_score: int | None = None
    insights: list[AnalysisInsightResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class AnalyzeRequest(BaseModel):
    ai_provider: str = "anthropic"
