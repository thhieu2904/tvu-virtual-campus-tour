"""
Database connection setup — SQLAlchemy async engine + session factory.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()

db_url = settings.DATABASE_URL or "postgresql+asyncpg://user:pass@localhost:5432/tvu_tour"
# Tự động chèn asyncpg vào connection string từ Supabase
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Async engine (uses asyncpg driver for PostgreSQL)
engine = create_async_engine(
    db_url,
    echo=settings.DEBUG,
    pool_size=5,
    max_overflow=10,
    connect_args={
        # Bắt buộc cho Supabase Transaction Pooler (PgBouncer) khi dùng asyncpg
        "prepared_statement_cache_size": 0,
        "statement_cache_size": 0,
    }
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
