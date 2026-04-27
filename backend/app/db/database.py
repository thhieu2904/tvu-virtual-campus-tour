"""
Database connection setup — SQLAlchemy async engine + session factory.

Cấu hình đặc biệt cho Supabase Transaction Pooler (PgBouncer):
- Tắt prepared statement cache (statement_cache_size=0)
- Dùng SSL context cho kết nối remote
"""

import ssl as _ssl
from urllib.parse import urlparse, quote_plus

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings

settings = get_settings()

_raw_url = settings.DATABASE_URL or "postgresql+asyncpg://user:pass@localhost:5432/tvu_tour"

# Parse URL để encode password đúng cách (tránh lỗi với ký tự đặc biệt)
_parsed = urlparse(_raw_url)
_password = quote_plus(_parsed.password) if _parsed.password else ""
_driver = "postgresql+asyncpg"
db_url = (
    f"{_driver}://{_parsed.username}:{_password}"
    f"@{_parsed.hostname}:{_parsed.port or 5432}{_parsed.path}"
)

# Xác định có cần SSL không (Supabase bắt buộc SSL)
_is_remote = "localhost" not in db_url and "127.0.0.1" not in db_url

import uuid

# Build connect_args — tắt hoàn toàn prepared statement cache cho PgBouncer
_connect_args: dict = {
    "statement_cache_size": 0,
    "prepared_statement_cache_size": 0,
    # QUAN TRỌNG: Tránh lỗi trùng tên prepared statement của PgBouncer
    "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4().hex}__"
}

if _is_remote:
    # asyncpg cần ssl context, không dùng sslmode trong URL
    _ssl_ctx = _ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = _ssl.CERT_NONE
    _connect_args["ssl"] = _ssl_ctx

# Async engine
# Dùng NullPool khi kết nối qua PgBouncer vì PgBouncer đã quản lý pool.
# Điều này cũng tránh lỗi prepared statement bị trùng khi connection bị reuse.
engine = create_async_engine(
    db_url,
    echo=settings.DEBUG,
    poolclass=NullPool if _is_remote else None,
    connect_args=_connect_args,
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
