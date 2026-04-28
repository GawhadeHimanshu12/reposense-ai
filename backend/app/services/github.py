from typing import Any

import httpx
import structlog

logger = structlog.get_logger()

GITHUB_API_BASE = "https://api.github.com"


class GitHubService:
    def __init__(self, access_token: str):
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def get_user(self) -> dict[str, Any]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{GITHUB_API_BASE}/user", headers=self.headers)
            resp.raise_for_status()
            return resp.json()

    async def get_repository(self, owner: str, repo: str) -> dict[str, Any]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}", headers=self.headers)
            resp.raise_for_status()
            return resp.json()

    async def list_user_repos(self, per_page: int = 30, page: int = 1) -> list[dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GITHUB_API_BASE}/user/repos",
                headers=self.headers,
                params={"per_page": per_page, "page": page, "sort": "updated"},
            )
            resp.raise_for_status()
            return resp.json()

    async def get_languages(self, owner: str, repo: str) -> dict[str, int]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/languages", headers=self.headers
            )
            resp.raise_for_status()
            return resp.json()

    async def get_contributors(self, owner: str, repo: str) -> list[dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contributors",
                headers=self.headers,
                params={"per_page": 10},
            )
            resp.raise_for_status()
            return resp.json()

    async def get_readme(self, owner: str, repo: str) -> str | None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/readme",
                headers={**self.headers, "Accept": "application/vnd.github.raw"},
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.text

    async def get_tree(self, owner: str, repo: str, branch: str = "HEAD") -> list[dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{branch}",
                headers=self.headers,
                params={"recursive": "1"},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("tree", [])
