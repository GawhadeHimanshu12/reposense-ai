"""
Comprehensive GitHub API service.

Separate from the thin app/services/github.py used by the repository-sync
flow.  This service is used by the analysis pipeline and works with both
authenticated requests (user OAuth token) and a server-side PAT
(GITHUB_TOKEN env var) for public-repo analysis without login.
"""

from __future__ import annotations

import asyncio
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import structlog

from app.core.config import settings

logger = structlog.get_logger()

GITHUB_API = "https://api.github.com"

# Files fetched verbatim for AI context (in priority order)
_KEY_FILE_CANDIDATES = [
    "README.md", "README.rst", "README.txt", "README",
    "package.json", "package-lock.json",
    "requirements.txt", "setup.py", "pyproject.toml", "setup.cfg", "Pipfile",
    "pom.xml", "build.gradle", "build.gradle.kts",
    "Cargo.toml",
    "go.mod",
    "composer.json",
    "Gemfile",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    ".gitignore",
    "Makefile",
    "tsconfig.json", ".eslintrc.json", ".eslintrc.js",
]

_IMPORTANT_DIRS = {"src", "lib", "app", "core", "main", "pkg", "internal"}

# Extensions considered "code" for LOC estimation
_CODE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".kt", ".go", ".rs",
    ".c", ".cpp", ".h", ".hpp", ".cs", ".rb", ".php", ".swift", ".scala",
    ".r", ".m", ".sh", ".bash", ".zsh",
}


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class RepoMetrics:
    size_kb: int
    contributor_count: int
    commit_count_30d: int
    open_issues: int
    open_prs: int
    issue_pr_ratio: float
    loc_estimate: int


@dataclass
class RepoData:
    metadata: dict[str, Any]
    languages: dict[str, int]
    file_tree: list[str]            # paths, capped at 1000
    file_extensions: dict[str, int] # ext -> count
    folder_structure: list[str]     # unique top-2-level directories
    key_files: dict[str, str]       # filename -> raw content
    rag_documents: dict[str, str]   # path -> raw content for retrieval
    metrics: RepoMetrics


# ── Exceptions ────────────────────────────────────────────────────────────────

class GitHubError(Exception):
    """Base class for GitHub service errors."""
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class RepoNotFoundError(GitHubError):
    pass


class RepoPrivateError(GitHubError):
    pass


class RateLimitError(GitHubError):
    def __init__(self, reset_at: datetime | None = None):
        super().__init__("GitHub API rate limit exceeded", status_code=429)
        self.reset_at = reset_at


class RepoTooLargeError(GitHubError):
    def __init__(self, size_kb: int):
        super().__init__(f"Repository is too large ({size_kb // 1024} MB > 500 MB)", status_code=422)
        self.size_kb = size_kb


# ── URL parsing ───────────────────────────────────────────────────────────────

_GITHUB_URL_RE = re.compile(
    r"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?(?:/.*)?$"
)


def parse_github_url(url: str) -> tuple[str, str]:
    """
    Extract (owner, repo) from a GitHub URL.
    Raises ValueError for non-GitHub or malformed URLs.
    """
    m = _GITHUB_URL_RE.match(url.strip())
    if not m:
        raise ValueError(f"Not a valid GitHub repository URL: {url!r}")
    owner, repo = m.group(1), m.group(2)
    # Reject dot-only names (e.g. ".." or ".")
    if owner.strip(".") == "" or repo.strip(".") == "":
        raise ValueError("Owner or repo name is invalid")
    return owner, repo


# ── Service ───────────────────────────────────────────────────────────────────

class GitHubService:
    """
    Full-featured GitHub API client for repository analysis.

    Priority of authentication:
      1. `access_token` passed to constructor (user OAuth token)
      2. `settings.GITHUB_TOKEN` server-side PAT
      3. Unauthenticated (60 req/h limit)
    """

    def __init__(self, access_token: str | None = None):
        token = access_token or getattr(settings, "GITHUB_TOKEN", "")
        self._auth_header = f"Bearer {token}" if token else None
        self._client: httpx.AsyncClient | None = None

    # ── Context manager ───────────────────────────────────────────────────

    async def __aenter__(self) -> "GitHubService":
        headers: dict[str, str] = {
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self._auth_header:
            headers["Authorization"] = self._auth_header
        self._client = httpx.AsyncClient(
            headers=headers,
            timeout=httpx.Timeout(20.0),
            follow_redirects=True,
        )
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    # ── Low-level request helper ──────────────────────────────────────────

    async def _get(self, path: str, **params: Any) -> Any:
        assert self._client, "Use GitHubService as async context manager"
        url = f"{GITHUB_API}{path}"
        resp = await self._client.get(url, params=params or None)
        self._handle_errors(resp)
        return resp.json()

    async def _get_raw(self, path: str) -> str | None:
        assert self._client
        headers = {**self._client.headers, "Accept": "application/vnd.github.raw"}
        resp = await self._client.get(f"{GITHUB_API}{path}", headers=headers)
        if resp.status_code == 404:
            return None
        self._handle_errors(resp)
        return resp.text

    @staticmethod
    def _handle_errors(resp: httpx.Response) -> None:
        if resp.status_code == 200:
            return
        if resp.status_code == 404:
            raise RepoNotFoundError("Repository not found", status_code=404)
        if resp.status_code == 403:
            # Could be private repo or rate limit
            body = resp.text
            reset_ts = resp.headers.get("X-RateLimit-Reset")
            reset_at = (
                datetime.fromtimestamp(int(reset_ts), tz=timezone.utc)
                if reset_ts and reset_ts.isdigit()
                else None
            )
            if "rate limit" in body.lower() or resp.headers.get("X-RateLimit-Remaining") == "0":
                raise RateLimitError(reset_at=reset_at)
            raise RepoPrivateError("Repository is private or access denied", status_code=403)
        if resp.status_code == 429:
            reset_ts = resp.headers.get("Retry-After")
            reset_at = (
                datetime.now(timezone.utc) + timedelta(seconds=int(reset_ts))
                if reset_ts and reset_ts.isdigit()
                else None
            )
            raise RateLimitError(reset_at=reset_at)
        resp.raise_for_status()

    # ── Public API ────────────────────────────────────────────────────────

    async def validate_repo_exists(self, owner: str, repo: str) -> dict[str, Any]:
        """
        Confirm the repo exists and is accessible.  Returns raw API metadata.
        Raises RepoNotFoundError, RepoPrivateError, or RateLimitError.
        """
        return await self._get(f"/repos/{owner}/{repo}")

    async def get_metadata(self, owner: str, repo: str) -> dict[str, Any]:
        data = await self._get(f"/repos/{owner}/{repo}")
        return {
            "id": data["id"],
            "full_name": data["full_name"],
            "name": data["name"],
            "owner": data["owner"]["login"],
            "description": data.get("description"),
            "html_url": data["html_url"],
            "homepage": data.get("homepage"),
            "language": data.get("language"),
            "topics": data.get("topics", []),
            "license": data["license"]["name"] if data.get("license") else None,
            "stars": data["stargazers_count"],
            "forks": data["forks_count"],
            "open_issues": data["open_issues_count"],
            "watchers": data["watchers_count"],
            "size_kb": data["size"],
            "default_branch": data["default_branch"],
            "created_at": data["created_at"],
            "updated_at": data["updated_at"],
            "pushed_at": data["pushed_at"],
            "is_fork": data["fork"],
            "is_archived": data["archived"],
        }

    async def get_languages(self, owner: str, repo: str) -> dict[str, int]:
        try:
            return await self._get(f"/repos/{owner}/{repo}/languages")
        except GitHubError:
            return {}

    async def get_file_tree(
        self, owner: str, repo: str, branch: str = "HEAD"
    ) -> tuple[list[str], dict[str, int], list[str]]:
        """
        Returns (file_paths, extension_counts, folder_structure).
        File list is capped at 1000 entries.
        """
        try:
            data = await self._get(
                f"/repos/{owner}/{repo}/git/trees/{branch}",
                recursive=1,
            )
        except GitHubError:
            return [], {}, []

        items: list[dict] = data.get("tree", [])
        files = [i["path"] for i in items if i.get("type") == "blob"][:1000]

        ext_counter: Counter[str] = Counter()
        for path in files:
            if "." in path.split("/")[-1]:
                ext = "." + path.rsplit(".", 1)[-1].lower()
                ext_counter[ext] += 1

        folders: set[str] = set()
        for path in files:
            parts = path.split("/")
            if len(parts) >= 2:
                folders.add(parts[0])
            if len(parts) >= 3:
                folders.add(f"{parts[0]}/{parts[1]}")

        return files, dict(ext_counter), sorted(folders)

    async def get_key_files(
        self, owner: str, repo: str, all_files: list[str]
    ) -> dict[str, str]:
        """
        Fetch contents of well-known config/manifest files + up to 10 code files.
        Returns filename -> raw text content.
        """
        all_files_set = set(all_files)
        results: dict[str, str] = {}

        # 1. Named key files
        fetch_paths: list[str] = []
        for candidate in _KEY_FILE_CANDIDATES:
            # Match at any depth, prefer root
            matches = [f for f in all_files if f == candidate or f.endswith("/" + candidate)]
            if matches:
                fetch_paths.append(sorted(matches, key=lambda p: p.count("/"))[0])

        # 2. Up to 10 important code files (prefer src/ or lib/ roots, larger files)
        code_files = [
            f for f in all_files
            if "." in f.split("/")[-1]
            and ("." + f.rsplit(".", 1)[-1].lower()) in _CODE_EXTENSIONS
            and not any(skip in f for skip in ["test", "spec", "mock", "fixture", "__pycache__", "vendor", "node_modules"])
        ]
        # Prioritise files in important directories
        code_files.sort(
            key=lambda p: (
                0 if any(p.startswith(d + "/") or p.startswith(d + "\\") for d in _IMPORTANT_DIRS) else 1,
                p.count("/"),
            )
        )
        for path in code_files[:10]:
            if path not in fetch_paths:
                fetch_paths.append(path)

        # Fetch concurrently, cap to 20 total
        async def _fetch(path: str) -> tuple[str, str | None]:
            try:
                content = await self._get_raw(f"/repos/{owner}/{repo}/contents/{path}")
                return path, content
            except Exception:
                return path, None

        coros = [_fetch(p) for p in fetch_paths[:20]]
        for name, content in await asyncio.gather(*coros):
            if content:
                # Truncate very large files
                results[name.split("/")[-1]] = content[:8000]

        return results

    async def get_rag_documents(
        self, owner: str, repo: str, all_files: list[str]
    ) -> dict[str, str]:
        """
        Fetch a bounded set of source/documentation files for local RAG.

        This intentionally avoids binary/generated/vendor paths and keeps the
        corpus small enough to store in the existing analysis JSONB payload.
        """
        allowed_exts = _CODE_EXTENSIONS | {
            ".md", ".mdx", ".rst", ".txt", ".json", ".yaml", ".yml", ".toml",
            ".ini", ".cfg", ".css", ".scss", ".html",
        }
        excluded_parts = {
            ".git", ".github", ".venv", "venv", "env", "node_modules",
            "dist", "build", "coverage", "__pycache__", "vendor", "target",
            ".pytest_cache",
        }

        def _is_candidate(path: str) -> bool:
            parts = set(path.split("/"))
            if parts & excluded_parts:
                return False
            filename = path.rsplit("/", 1)[-1]
            if "." not in filename:
                return filename in {"Dockerfile", "Makefile", "README"}
            ext = "." + filename.rsplit(".", 1)[-1].lower()
            return ext in allowed_exts

        candidates = [path for path in all_files if _is_candidate(path)]
        candidates.sort(
            key=lambda p: (
                0 if p.rsplit("/", 1)[-1].lower().startswith("readme") else 1,
                0 if any(p.startswith(d + "/") for d in _IMPORTANT_DIRS) else 1,
                p.count("/"),
                len(p),
            )
        )

        async def _fetch(path: str) -> tuple[str, str | None]:
            try:
                content = await self._get_raw(f"/repos/{owner}/{repo}/contents/{path}")
                return path, content
            except Exception:
                return path, None

        documents: dict[str, str] = {}
        for path, content in await asyncio.gather(*[_fetch(p) for p in candidates[:40]]):
            if content and "\x00" not in content:
                documents[path] = content[:12_000]
        return documents

    async def get_contributors(self, owner: str, repo: str) -> int:
        """Return total contributor count (caps at 500)."""
        try:
            data = await self._get(
                f"/repos/{owner}/{repo}/contributors",
                per_page=1,
                anon=1,
            )
            # GitHub returns Link header for pagination; if list has 1 item page exists
            # For a rough count we fetch with per_page=100 pages
            data100 = await self._get(
                f"/repos/{owner}/{repo}/contributors",
                per_page=100,
                anon=1,
            )
            return len(data100) if isinstance(data100, list) else 0
        except GitHubError:
            return 0

    async def get_commit_frequency(self, owner: str, repo: str) -> int:
        """Return number of commits in the last 30 days."""
        since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        try:
            commits = await self._get(
                f"/repos/{owner}/{repo}/commits",
                since=since,
                per_page=100,
            )
            return len(commits) if isinstance(commits, list) else 0
        except GitHubError:
            return 0

    async def get_open_pr_count(self, owner: str, repo: str) -> int:
        try:
            prs = await self._get(
                f"/repos/{owner}/{repo}/pulls",
                state="open",
                per_page=1,
            )
            # Crude: count returned items; real pagination would need Link header parsing
            prs_100 = await self._get(
                f"/repos/{owner}/{repo}/pulls",
                state="open",
                per_page=100,
            )
            return len(prs_100) if isinstance(prs_100, list) else 0
        except GitHubError:
            return 0

    # ── High-level orchestrator ───────────────────────────────────────────

    async def fetch_repo_data(self, url: str) -> RepoData:
        """
        Full data-collection pass for a repository URL.
        Raises GitHubError subclasses on failure.
        """
        owner, repo = parse_github_url(url)
        logger.info("Fetching repo data", owner=owner, repo=repo)

        # Metadata first — validates access and gets size
        metadata = await self.get_metadata(owner, repo)

        size_kb: int = metadata["size_kb"]
        if size_kb > 500 * 1024:  # 500 MB
            raise RepoTooLargeError(size_kb)

        branch: str = metadata["default_branch"]

        # Parallel fetches
        (
            languages,
            (file_tree, ext_counts, folders),
            contributors,
            commits_30d,
            open_prs,
        ) = await asyncio.gather(
            self.get_languages(owner, repo),
            self.get_file_tree(owner, repo, branch),
            self.get_contributors(owner, repo),
            self.get_commit_frequency(owner, repo),
            self.get_open_pr_count(owner, repo),
        )

        key_files, rag_documents = await asyncio.gather(
            self.get_key_files(owner, repo, file_tree),
            self.get_rag_documents(owner, repo, file_tree),
        )

        open_issues: int = metadata["open_issues"]
        issue_pr_ratio = (
            round(open_issues / open_prs, 2) if open_prs else float(open_issues)
        )

        # LOC estimate: each code file averages ~100 lines
        code_file_count = sum(
            v for ext, v in ext_counts.items() if ext in _CODE_EXTENSIONS
        )
        loc_estimate = code_file_count * 100

        metrics = RepoMetrics(
            size_kb=size_kb,
            contributor_count=contributors,
            commit_count_30d=commits_30d,
            open_issues=open_issues,
            open_prs=open_prs,
            issue_pr_ratio=issue_pr_ratio,
            loc_estimate=loc_estimate,
        )

        logger.info(
            "Repo data collected",
            repo=metadata["full_name"],
            files=len(file_tree),
            key_files=len(key_files),
            loc_estimate=loc_estimate,
        )

        return RepoData(
            metadata=metadata,
            languages=languages,
            file_tree=file_tree,
            file_extensions=ext_counts,
            folder_structure=folders,
            key_files=key_files,
            rag_documents=rag_documents,
            metrics=metrics,
        )
