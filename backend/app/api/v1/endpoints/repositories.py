import uuid

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, get_current_user_id, get_db, rate_limit, rate_limit_analysis
from app.db.models.analysis import AnalysisInsight
from app.db.models.repository import AnalysisStatus, Repository, RepositoryAnalysis
from app.db.models.user import User
from app.schemas.repository import AnalyzeRequest, RepositoryAnalysisResponse, RepositoryResponse
from app.services.ai_analyzer import AIAnalyzer
from app.services.github import GitHubService

router = APIRouter()
logger = structlog.get_logger()


@router.get("/", response_model=list[RepositoryResponse])
async def list_repositories(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Repository).where(Repository.owner_id == user_id))
    return result.scalars().all()


@router.post("/sync", response_model=list[RepositoryResponse])
async def sync_github_repos(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(rate_limit),
):
    if not user.github_access_token:
        raise HTTPException(status_code=400, detail="GitHub account not connected")

    gh = GitHubService(user.github_access_token)
    gh_repos = await gh.list_user_repos()

    synced: list[Repository] = []
    for gh_repo in gh_repos:
        result = await db.execute(
            select(Repository).where(Repository.github_id == gh_repo["id"])
        )
        repo = result.scalar_one_or_none()
        if not repo:
            repo = Repository(
                owner_id=user.id,
                github_id=gh_repo["id"],
                full_name=gh_repo["full_name"],
                name=gh_repo["name"],
                description=gh_repo.get("description"),
                html_url=gh_repo["html_url"],
                clone_url=gh_repo.get("clone_url"),
                language=gh_repo.get("language"),
                stars=gh_repo.get("stargazers_count", 0),
                forks=gh_repo.get("forks_count", 0),
                open_issues=gh_repo.get("open_issues_count", 0),
                is_private=gh_repo.get("private", False),
                is_fork=gh_repo.get("fork", False),
                topics=gh_repo.get("topics", []),
            )
            db.add(repo)
        else:
            repo.stars = gh_repo.get("stargazers_count", 0)
            repo.forks = gh_repo.get("forks_count", 0)
            repo.open_issues = gh_repo.get("open_issues_count", 0)
        synced.append(repo)

    await db.commit()
    return synced


@router.get("/{repo_id}", response_model=RepositoryResponse)
async def get_repository(
    repo_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == user_id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.post("/{repo_id}/analyze", response_model=RepositoryAnalysisResponse)
async def analyze_repository(
    repo_id: uuid.UUID,
    payload: AnalyzeRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(rate_limit_analysis),
):
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    analysis = RepositoryAnalysis(
        repository_id=repo.id,
        ai_provider=payload.ai_provider,
        status=AnalysisStatus.PENDING,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    background_tasks.add_task(_run_analysis, str(analysis.id), str(user.id))
    return analysis


@router.get("/{repo_id}/analyses", response_model=list[RepositoryAnalysisResponse])
async def list_analyses(
    repo_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RepositoryAnalysis)
        .join(Repository)
        .where(Repository.id == repo_id, Repository.owner_id == user.id)
        .options(selectinload(RepositoryAnalysis.insights))
        .order_by(RepositoryAnalysis.created_at.desc())
    )
    return result.scalars().all()


async def _run_analysis(analysis_id: str, user_id: str):
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(RepositoryAnalysis)
                .where(RepositoryAnalysis.id == analysis_id)
                .options(selectinload(RepositoryAnalysis.repository))
            )
            analysis = result.scalar_one()
            analysis.status = AnalysisStatus.RUNNING
            await db.commit()

            repo = analysis.repository
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one()

            repo_data = repo.__dict__.copy()
            repo_data["stargazers_count"] = repo.stars
            repo_data["forks_count"] = repo.forks
            repo_data["open_issues_count"] = repo.open_issues

            if user.github_access_token:
                gh = GitHubService(user.github_access_token)
                owner, name = repo.full_name.split("/", 1)
                try:
                    tree = await gh.get_tree(owner, name)
                    repo_data["file_tree"] = [t["path"] for t in tree if t["type"] == "blob"]
                    repo_data["readme"] = await gh.get_readme(owner, name)
                except Exception:
                    pass

            analyzer = AIAnalyzer(analysis.ai_provider)
            ai_result = await analyzer.analyze(repo_data)

            analysis.status = AnalysisStatus.COMPLETED
            analysis.summary = ai_result.get("summary")
            analysis.code_quality_score = ai_result.get("code_quality_score")
            analysis.security_score = ai_result.get("security_score")
            analysis.maintainability_score = ai_result.get("maintainability_score")

            for insight_data in ai_result.get("insights", []):
                insight = AnalysisInsight(
                    analysis_id=analysis.id,
                    category=insight_data.get("category", "general"),
                    severity=insight_data.get("severity", "info"),
                    title=insight_data.get("title", ""),
                    description=insight_data.get("description", ""),
                    file_path=insight_data.get("file_path"),
                )
                db.add(insight)

            await db.commit()
            logger.info("Analysis completed", analysis_id=analysis_id)

        except Exception as e:
            logger.error("Analysis failed", analysis_id=analysis_id, error=str(e))
            result = await db.execute(
                select(RepositoryAnalysis).where(RepositoryAnalysis.id == analysis_id)
            )
            analysis = result.scalar_one_or_none()
            if analysis:
                analysis.status = AnalysisStatus.FAILED
                analysis.error_message = str(e)
                await db.commit()
