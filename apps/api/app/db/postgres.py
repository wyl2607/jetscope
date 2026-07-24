"""PostgreSQL connection helpers.

Production is frozen on SQLite (see docs/DEPLOYMENT_GUIDE.md). These helpers exist
only for the experimental, unsupported SQLite->PostgreSQL migration path and are
not wired into any live route or service. To use them you MUST provide a real
Postgres DSN via JETSCOPE_POSTGRES_URL (or the legacy SAFVSOIL_POSTGRES_URL);
otherwise they fail loudly instead of silently falling back to the SQLite
``database_url`` (which previously masked a misconfigured cutover).
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def _resolve_postgres_url(database_url: str | None = None) -> str:
    url = database_url or os.getenv("JETSCOPE_POSTGRES_URL") or os.getenv("SAFVSOIL_POSTGRES_URL")
    if not url:
        raise RuntimeError(
            "PostgreSQL path requested but no Postgres URL is configured. Production is "
            "frozen on SQLite; set JETSCOPE_POSTGRES_URL to an explicit postgresql:// DSN "
            "to use the experimental migration path. Refusing to fall back to the SQLite "
            "database_url."
        )
    if url.startswith("sqlite"):
        raise RuntimeError(
            f"PostgreSQL path resolved to a non-Postgres URL ({url.split('://', 1)[0]}://...); "
            "refusing to run the Postgres path against SQLite."
        )
    return url


def create_postgres_engine(database_url: str | None = None):
    """Create a PostgreSQL engine with production-style connection pooling."""
    engine = create_engine(
        _resolve_postgres_url(database_url),
        future=True,
        pool_size=8,
        max_overflow=2,
        pool_pre_ping=True,
        pool_recycle=300,
    )
    return engine


def get_postgres_session_local(database_url: str | None = None):
    """Get a PostgreSQL sessionmaker bound to a freshly created engine."""
    engine = create_postgres_engine(database_url)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True), engine


def get_postgres_db(database_url: str | None = None):
    """Dependency for getting a PostgreSQL DB session."""
    SessionLocal, _ = get_postgres_session_local(database_url)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
