"""
Integration test fixtures.

Requires a running PostgreSQL instance at the TEST_DATABASE_URL below and a
running Redis instance (or the tests that need Redis mock it out).

Tables are created once per test session and dropped on teardown.
"""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.deps import get_db
from app.db.session import Base
from app.main import app

TEST_DATABASE_URL = (
    "postgresql+asyncpg://reposense:reposense_secret@localhost:5432/reposense_test"
)

_test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
_TestSession = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables():
    import app.db.models  # noqa: F401 — registers all mappers

    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _test_engine.dispose()


@pytest_asyncio.fixture
async def db_session():
    async with _TestSession() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
