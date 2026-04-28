from contextlib import asynccontextmanager
from datetime import datetime, timezone

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import engine, Base, AsyncSessionLocal
from app.core.redis import redis_client

setup_logging()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting RepoSense AI", env=settings.APP_ENV)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await redis_client.ping()
    logger.info("Database and cache connected")
    yield
    await engine.dispose()
    await redis_client.aclose()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered GitHub repository analyzer",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    db_status = "healthy"
    redis_status = "healthy"

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        db_status = "unhealthy"

    try:
        await redis_client.ping()
    except Exception:
        redis_status = "unhealthy"

    overall = db_status == "healthy" and redis_status == "healthy"

    return {
        "status": "healthy" if overall else "unhealthy",
        "database": db_status,
        "redis": redis_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
    }
