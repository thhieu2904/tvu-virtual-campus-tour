"""
Database connection setup — SQLAlchemy async engine + session factory.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()

# Async engine (uses asyncpg driver for PostgreSQL)
engine = create_async_engine(
    settings.DATABASE_URL or "postgresql+asyncpg://user:pass@localhost:5432/tvu_tour",
    echo=settings.DEBUG,
    pool_size=5,
    max_overflow=10,
)

# Session factory
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    """Dependency: yields a DB session, auto-closes after request."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
