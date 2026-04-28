"""
Multi-provider AI analysis engine.

Provider priority (runtime):
  1. Value stored in SystemSettings key "ai_defaults" → "provider"
  2. Constructor argument
  3. Falls back through FALLBACK_ORDER if primary raises

Supported providers:  anthropic | openai | gemini
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any

import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings
from app.services.rag_service import format_retrieved_context, retrieve_context

logger = structlog.get_logger()

FALLBACK_ORDER = ["anthropic", "openai", "gemini"]

# ── Token / cost constants ────────────────────────────────────────────────────
# Approximate costs in USD per 1 000 tokens (input / output)
_COST_TABLE: dict[str, tuple[float, float]] = {
    "anthropic": (0.003, 0.015),   # claude-sonnet-4-6
    "openai":    (0.01,  0.03),    # gpt-4-turbo
    "gemini":    (0.00025, 0.0005),# gemini-1.5-pro
}

_MAX_TOKENS_ANALYSIS = 4096
_MAX_TOKENS_CHAT = 2048
_REQUEST_TIMEOUT = 30.0


# ── Result dataclasses ────────────────────────────────────────────────────────

@dataclass
class ProviderUsage:
    provider: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    cost_usd: float

    @classmethod
    def compute(cls, provider: str, input_tok: int, output_tok: int, latency_ms: int) -> "ProviderUsage":
        rate_in, rate_out = _COST_TABLE.get(provider, (0.0, 0.0))
        cost = (input_tok / 1000) * rate_in + (output_tok / 1000) * rate_out
        return cls(
            provider=provider,
            input_tokens=input_tok,
            output_tokens=output_tok,
            latency_ms=latency_ms,
            cost_usd=round(cost, 6),
        )


@dataclass
class AnalysisResult:
    # Narrative
    summary: str
    tech_stack: dict[str, Any]
    architecture: dict[str, Any]
    code_quality: dict[str, Any]
    security: dict[str, Any]
    performance: dict[str, Any]
    scalability: dict[str, Any]
    recommendations: list[str]
    complexity_score: int          # 1-10
    complexity_explanation: str
    # Backward-compat scores (used by existing RepositoryAnalysis model)
    code_quality_score: int        # 0-100
    security_score: int            # 0-100
    maintainability_score: int     # 0-100
    # Meta
    usage: ProviderUsage
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class ChatResult:
    answer: str
    follow_up_suggestions: list[str]
    usage: ProviderUsage


# ── Exceptions ────────────────────────────────────────────────────────────────

class AIProviderError(Exception):
    def __init__(self, provider: str, message: str):
        super().__init__(f"[{provider}] {message}")
        self.provider = provider


class AllProvidersFailedError(Exception):
    pass


# ── Prompt templates ──────────────────────────────────────────────────────────

_ANALYSIS_SYSTEM = """\
You are an expert software architect and security engineer performing a \
deep analysis of a GitHub repository. Be precise, evidence-based, and \
avoid speculation. If you are uncertain about something, say so explicitly. \
Never invent file names, function names, or metrics that are not present \
in the data provided.

Always respond with valid JSON matching the schema below — no markdown fences, \
no extra keys, no trailing commas."""

_ANALYSIS_SCHEMA = """\
{
  "summary": "<2-3 paragraph executive summary>",
  "tech_stack": {
    "languages": ["..."],
    "frameworks": ["..."],
    "tools": ["..."],
    "infrastructure": ["..."]
  },
  "architecture": {
    "structure_quality": "<description>",
    "design_patterns": ["..."],
    "modularity_score": <1-10>,
    "notes": "<free text>"
  },
  "code_quality": {
    "complexity_assessment": "<description>",
    "best_practices": ["<observed good practice>"],
    "issues": ["<potential issue>"],
    "score": <0-100>
  },
  "security": {
    "patterns_observed": ["..."],
    "concerns": ["..."],
    "score": <0-100>
  },
  "performance": {
    "observations": ["..."],
    "bottlenecks": ["..."]
  },
  "scalability": {
    "strengths": ["..."],
    "limitations": ["..."]
  },
  "recommendations": [
    "<actionable recommendation 1>",
    "<actionable recommendation 2>",
    "<actionable recommendation 3>",
    "<actionable recommendation 4>",
    "<actionable recommendation 5>"
  ],
  "complexity_score": <1-10>,
  "complexity_explanation": "<one sentence>",
  "maintainability_score": <0-100>
}"""

_ANALYSIS_USER_TEMPLATE = """\
Analyse the following GitHub repository and return JSON matching the schema.

## Repository metadata
Name: {full_name}
Description: {description}
Primary language: {language}
Languages breakdown: {languages}
Topics: {topics}
License: {license}
Stars: {stars} | Forks: {forks} | Open issues: {open_issues} | Open PRs: {open_prs}
Estimated LOC: {loc_estimate}
Contributors: {contributors}
Commits (last 30d): {commits_30d}
Repository size: {size_kb} KB
Created: {created_at} | Last push: {pushed_at}

## File tree ({file_count} files, showing first 100)
{file_tree}

## Extension breakdown
{extensions}

## Folder structure
{folders}

## Key file contents
{key_files}

## Retrieved repository context
{retrieved_context}

---
Schema to follow:
{schema}"""

_CHAT_SYSTEM = """\
You are an expert software engineer assisting a developer who has just had \
their GitHub repository analysed by RepoSense AI. You have access to the \
full analysis result and key repository files. Answer questions accurately, \
cite specific files or sections when relevant, and offer code examples where \
helpful. If you don't know something, say so — never fabricate details.

Keep answers concise (under 400 words unless a longer explanation is \
genuinely needed). Always end your JSON response with 2-3 follow-up \
question suggestions."""

_CHAT_SCHEMA = """\
{
  "answer": "<your answer>",
  "follow_up_suggestions": [
    "<question 1>",
    "<question 2>",
    "<question 3>"
  ]
}"""

_CHAT_USER_TEMPLATE = """\
## Repository: {full_name}
## Analysis summary
{analysis_summary}

## Key files available
{key_files_list}

## Retrieved repository context
{retrieved_context}

## Conversation history
{history}

## User question
{question}

Respond with JSON:
{schema}"""


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_analysis_prompt(repo: dict[str, Any]) -> str:
    metadata = repo.get("metadata", {})
    key_files = repo.get("key_files", {})
    metrics = repo.get("metrics", {})

    key_files_text = ""
    for name, content in list(key_files.items())[:8]:
        key_files_text += f"\n### {name}\n```\n{content[:1500]}\n```\n"

    extensions = repo.get("file_extensions", {})
    ext_summary = ", ".join(
        f"{ext}:{count}" for ext, count in
        sorted(extensions.items(), key=lambda x: -x[1])[:15]
    )
    retrieval_query = " ".join(
        [
            "architecture security performance maintainability dependencies entrypoints",
            metadata.get("description") or "",
            metadata.get("language") or "",
            " ".join(metadata.get("topics", [])),
        ]
    )
    retrieved_context = format_retrieved_context(
        retrieve_context(retrieval_query, repo, max_chunks=8)
    )

    return _ANALYSIS_USER_TEMPLATE.format(
        full_name=metadata.get("full_name", "unknown"),
        description=metadata.get("description") or "No description",
        language=metadata.get("language") or "unknown",
        languages=json.dumps(repo.get("languages", {})),
        topics=", ".join(metadata.get("topics", [])) or "none",
        license=metadata.get("license") or "none",
        stars=metadata.get("stars", 0),
        forks=metadata.get("forks", 0),
        open_issues=metadata.get("open_issues", 0),
        open_prs=metrics.get("open_prs", 0) if isinstance(metrics, dict) else getattr(metrics, "open_prs", 0),
        loc_estimate=metrics.get("loc_estimate", 0) if isinstance(metrics, dict) else getattr(metrics, "loc_estimate", 0),
        contributors=metrics.get("contributor_count", 0) if isinstance(metrics, dict) else getattr(metrics, "contributor_count", 0),
        commits_30d=metrics.get("commit_count_30d", 0) if isinstance(metrics, dict) else getattr(metrics, "commit_count_30d", 0),
        size_kb=metrics.get("size_kb", 0) if isinstance(metrics, dict) else getattr(metrics, "size_kb", 0),
        created_at=metadata.get("created_at", ""),
        pushed_at=metadata.get("pushed_at", ""),
        file_count=len(repo.get("file_tree", [])),
        file_tree="\n".join(repo.get("file_tree", [])[:100]),
        extensions=ext_summary,
        folders="\n".join(repo.get("folder_structure", [])[:30]),
        key_files=key_files_text or "None available",
        retrieved_context=retrieved_context,
        schema=_ANALYSIS_SCHEMA,
    )


def _build_chat_prompt(
    repo_context: dict[str, Any],
    analysis_summary: Any,
    history: list[dict[str, str]],
    question: str,
) -> str:
    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in history[-10:]
    ) or "(no prior messages)"

    key_files_list = ", ".join(
        repo_context.get("key_files", {}).keys()
    ) or "none"
    retrieved_context = format_retrieved_context(
        retrieve_context(question, repo_context, max_chunks=6)
    )
    if isinstance(analysis_summary, dict):
        analysis_text = json.dumps(analysis_summary, indent=2)[:1400]
    else:
        analysis_text = str(analysis_summary or "")[:1400]

    return _CHAT_USER_TEMPLATE.format(
        full_name=repo_context.get("metadata", {}).get("full_name", "unknown"),
        analysis_summary=analysis_text,
        key_files_list=key_files_list,
        retrieved_context=retrieved_context,
        history=history_text,
        question=question,
        schema=_CHAT_SCHEMA,
    )


# ── JSON parser ───────────────────────────────────────────────────────────────

def _safe_parse_json(text: str) -> dict[str, Any]:
    """Parse JSON from model output; strips markdown fences if present."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        # Drop first line (``` or ```json) and last ```
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find the first {...} block
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
        logger.warning("JSON parse failed, returning raw text", snippet=text[:200])
        return {"_raw": text, "summary": text[:500]}


def _normalise_analysis(raw: dict[str, Any], usage: ProviderUsage) -> AnalysisResult:
    code_quality = raw.get("code_quality", {})
    security = raw.get("security", {})
    return AnalysisResult(
        summary=raw.get("summary", ""),
        tech_stack=raw.get("tech_stack", {}),
        architecture=raw.get("architecture", {}),
        code_quality=code_quality,
        security=security,
        performance=raw.get("performance", {}),
        scalability=raw.get("scalability", {}),
        recommendations=raw.get("recommendations", []),
        complexity_score=int(raw.get("complexity_score", 5)),
        complexity_explanation=raw.get("complexity_explanation", ""),
        code_quality_score=int(code_quality.get("score", 0)),
        security_score=int(security.get("score", 0)),
        maintainability_score=int(raw.get("maintainability_score", 0)),
        usage=usage,
        raw=raw,
    )


# ── Provider implementations ──────────────────────────────────────────────────

class _ProviderBase:
    name: str = ""

    def _is_configured(self) -> bool:
        raise NotImplementedError

    async def complete(
        self,
        system: str,
        user: str,
        max_tokens: int,
    ) -> tuple[str, int, int]:
        """Return (text, input_tokens, output_tokens)."""
        raise NotImplementedError

    def _retry_exceptions(self) -> tuple[type[Exception], ...]:
        return (Exception,)


class _AnthropicProvider(_ProviderBase):
    name = "anthropic"

    def _is_configured(self) -> bool:
        return bool(settings.ANTHROPIC_API_KEY)

    @retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def complete(self, system: str, user: str, max_tokens: int) -> tuple[str, int, int]:
        import anthropic

        client = anthropic.AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=_REQUEST_TIMEOUT,
        )
        try:
            msg = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except anthropic.RateLimitError as e:
            raise AIProviderError("anthropic", f"Rate limited: {e}") from e
        except anthropic.AuthenticationError as e:
            raise AIProviderError("anthropic", f"Invalid API key: {e}") from e
        except anthropic.APITimeoutError as e:
            raise AIProviderError("anthropic", f"Timeout: {e}") from e
        except anthropic.APIError as e:
            raise AIProviderError("anthropic", str(e)) from e

        text = msg.content[0].text
        return text, msg.usage.input_tokens, msg.usage.output_tokens


class _OpenAIProvider(_ProviderBase):
    name = "openai"

    def _is_configured(self) -> bool:
        return bool(settings.OPENAI_API_KEY)

    @retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def complete(self, system: str, user: str, max_tokens: int) -> tuple[str, int, int]:
        from openai import AsyncOpenAI, APIStatusError, APITimeoutError, AuthenticationError, RateLimitError

        client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=_REQUEST_TIMEOUT,
        )
        try:
            resp = await client.chat.completions.create(
                model="gpt-4-turbo",
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                response_format={"type": "json_object"},
            )
        except RateLimitError as e:
            raise AIProviderError("openai", f"Rate limited: {e}") from e
        except AuthenticationError as e:
            raise AIProviderError("openai", f"Invalid API key: {e}") from e
        except APITimeoutError as e:
            raise AIProviderError("openai", f"Timeout: {e}") from e
        except APIStatusError as e:
            raise AIProviderError("openai", str(e)) from e

        text = resp.choices[0].message.content or ""
        usage = resp.usage
        return text, usage.prompt_tokens, usage.completion_tokens


class _GeminiProvider(_ProviderBase):
    name = "gemini"

    def _is_configured(self) -> bool:
        return bool(settings.GEMINI_API_KEY)

    @retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def complete(self, system: str, user: str, max_tokens: int) -> tuple[str, int, int]:
        import httpx

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-1.5-pro:generateContent?key={settings.GEMINI_API_KEY}"
        )
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"parts": [{"text": user}]}],
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "responseMimeType": "application/json",
            },
        }
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 429:
                raise AIProviderError("gemini", "Rate limited")
            if resp.status_code == 401:
                raise AIProviderError("gemini", "Invalid API key")
            resp.raise_for_status()
            data = resp.json()

        candidates = data.get("candidates", [])
        if not candidates:
            raise AIProviderError("gemini", "Empty response")

        text = candidates[0]["content"]["parts"][0]["text"]
        # Gemini doesn't return token counts in the same field — estimate
        metadata = data.get("usageMetadata", {})
        input_tok = metadata.get("promptTokenCount", len(user) // 4)
        output_tok = metadata.get("candidatesTokenCount", len(text) // 4)
        return text, input_tok, output_tok


_PROVIDERS: dict[str, _ProviderBase] = {
    "anthropic": _AnthropicProvider(),
    "openai": _OpenAIProvider(),
    "gemini": _GeminiProvider(),
}


# ── Main service ──────────────────────────────────────────────────────────────

class AIService:
    """
    Unified AI service.  Instantiate once per request (or per task).

    `preferred_provider` is tried first; on failure the service walks
    FALLBACK_ORDER skipping any unconfigured or previously-failed provider.
    """

    def __init__(self, preferred_provider: str = "anthropic"):
        self.preferred_provider = preferred_provider

    # ── Provider resolution ───────────────────────────────────────────────

    def _ordered_providers(self) -> list[_ProviderBase]:
        seen: set[str] = set()
        ordered: list[_ProviderBase] = []
        for name in [self.preferred_provider] + FALLBACK_ORDER:
            if name in seen:
                continue
            seen.add(name)
            p = _PROVIDERS.get(name)
            if p and p._is_configured():
                ordered.append(p)
        return ordered

    async def _call_with_fallback(
        self,
        system: str,
        user_prompt: str,
        max_tokens: int,
    ) -> tuple[str, ProviderUsage]:
        providers = self._ordered_providers()
        if not providers:
            raise AllProvidersFailedError("No AI provider is configured")

        errors: list[str] = []
        for provider in providers:
            t0 = time.monotonic()
            try:
                text, input_tok, output_tok = await provider.complete(
                    system, user_prompt, max_tokens
                )
                latency_ms = int((time.monotonic() - t0) * 1000)
                usage = ProviderUsage.compute(provider.name, input_tok, output_tok, latency_ms)
                logger.info(
                    "AI call succeeded",
                    provider=provider.name,
                    latency_ms=latency_ms,
                    input_tokens=input_tok,
                    output_tokens=output_tok,
                    cost_usd=usage.cost_usd,
                )
                return text, usage
            except AIProviderError as exc:
                errors.append(str(exc))
                logger.warning("AI provider failed, trying next", provider=provider.name, error=str(exc))
            except Exception as exc:
                errors.append(f"{provider.name}: {exc}")
                logger.warning("Unexpected provider error", provider=provider.name, error=str(exc))

        raise AllProvidersFailedError(
            "All providers failed:\n" + "\n".join(errors)
        )

    # ── Public API ────────────────────────────────────────────────────────

    async def analyse_repository(self, repo_data: dict[str, Any]) -> AnalysisResult:
        """
        Full repository analysis.

        `repo_data` is the dict representation of a `RepoData` dataclass
        (or any dict with the same keys).
        """
        user_prompt = _build_analysis_prompt(repo_data)
        text, usage = await self._call_with_fallback(
            _ANALYSIS_SYSTEM, user_prompt, _MAX_TOKENS_ANALYSIS
        )
        raw = _safe_parse_json(text)
        return _normalise_analysis(raw, usage)

    async def chat(
        self,
        question: str,
        repo_context: dict[str, Any],
        analysis_summary: str,
        history: list[dict[str, str]],
    ) -> ChatResult:
        """
        Single conversational turn about a previously-analysed repository.

        `history` is a list of {"role": "user"|"assistant", "content": "..."}.
        Up to the last 10 messages are included in the prompt.
        """
        user_prompt = _build_chat_prompt(
            repo_context, analysis_summary, history, question
        )
        text, usage = await self._call_with_fallback(
            _CHAT_SYSTEM, user_prompt, _MAX_TOKENS_CHAT
        )
        raw = _safe_parse_json(text)
        answer = raw.get("answer") or raw.get("_raw", text)
        suggestions = raw.get("follow_up_suggestions", [])
        return ChatResult(answer=answer, follow_up_suggestions=suggestions, usage=usage)

    # ── Connectivity test ─────────────────────────────────────────────────

    async def test_provider(self, name: str) -> dict[str, Any]:
        """Ping a single provider with a minimal prompt. Returns status dict."""
        provider = _PROVIDERS.get(name)
        if not provider:
            return {"provider": name, "status": "unknown", "error": "Provider not found"}
        if not provider._is_configured():
            return {"provider": name, "status": "unconfigured", "error": "API key not set"}

        t0 = time.monotonic()
        try:
            text, in_tok, out_tok = await provider.complete(
                "You are a test assistant.",
                "Reply with exactly: {\"ok\": true}",
                max_tokens=16,
            )
            latency_ms = int((time.monotonic() - t0) * 1000)
            return {
                "provider": name,
                "status": "ok",
                "latency_ms": latency_ms,
                "input_tokens": in_tok,
                "output_tokens": out_tok,
            }
        except Exception as exc:
            return {"provider": name, "status": "error", "error": str(exc)}
