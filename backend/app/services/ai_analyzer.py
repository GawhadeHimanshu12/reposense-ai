from typing import Any

import structlog

logger = structlog.get_logger()

ANALYSIS_PROMPT = """You are an expert software engineer performing a comprehensive code repository analysis.

Repository: {full_name}
Description: {description}
Primary Language: {language}
Stars: {stars} | Forks: {forks} | Open Issues: {open_issues}
Topics: {topics}

File tree (sample):
{file_tree}

README:
{readme}

Analyze this repository and provide:
1. Executive summary (2-3 sentences)
2. Code quality assessment (score 0-100)
3. Security assessment (score 0-100)
4. Maintainability assessment (score 0-100)
5. Key insights with category, severity (info/warning/critical), title, and description

Respond in JSON with this exact structure:
{{
  "summary": "...",
  "code_quality_score": 85,
  "security_score": 72,
  "maintainability_score": 90,
  "insights": [
    {{
      "category": "security|quality|performance|documentation|dependency",
      "severity": "info|warning|critical",
      "title": "...",
      "description": "...",
      "file_path": null
    }}
  ]
}}"""


class AIAnalyzer:
    def __init__(self, provider: str = "anthropic"):
        self.provider = provider

    async def analyze(self, repo_data: dict[str, Any]) -> dict[str, Any]:
        prompt = ANALYSIS_PROMPT.format(
            full_name=repo_data.get("full_name", ""),
            description=repo_data.get("description", "No description"),
            language=repo_data.get("language", "Unknown"),
            stars=repo_data.get("stargazers_count", 0),
            forks=repo_data.get("forks_count", 0),
            open_issues=repo_data.get("open_issues_count", 0),
            topics=", ".join(repo_data.get("topics", [])),
            file_tree="\n".join(repo_data.get("file_tree", [])[:50]),
            readme=(repo_data.get("readme", "") or "")[:2000],
        )

        if self.provider == "anthropic":
            return await self._analyze_with_anthropic(prompt)
        return await self._analyze_with_openai(prompt)

    async def _analyze_with_anthropic(self, prompt: str) -> dict[str, Any]:
        import json

        import anthropic

        from app.core.config import settings

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text
        return json.loads(text)

    async def _analyze_with_openai(self, prompt: str) -> dict[str, Any]:
        import json

        from openai import AsyncOpenAI

        from app.core.config import settings

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
