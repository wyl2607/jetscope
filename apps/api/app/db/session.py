from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

engine = create_engine(settings.database_url, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Zero-downtime migration: gradual read cutover ────────────────────────────
# During Phase 2 of the SQLite -> PostgreSQL migration, reads can be gradually
# routed to Postgres via the READ_POSTGRES_PCT environment variable.
#
# Usage:
#   READ_POSTGRES_PCT=10 uvicorn app.main:app   # 10% Postgres reads
#   READ_POSTGRES_PCT=100 uvicorn app.main:app  # 100% Postgres reads (Phase 3)
# ─────────────────────────────────────────────────────────────────────────────
import os
import random

_READ_POSTGRES_PCT = int(os.getenv("READ_POSTGRES_PCT", "0"))


def get_read_db():
    """Yield a read database session, respecting READ_POSTGRES_PCT for cutover."""
    pct = _READ_POSTGRES_PCT
    use_postgres = random.randint(1, 100) <= pct

    if use_postgres:
        from app.db.postgres import get_postgres_db
        yield from get_postgres_db()
    else:
        yield from get_db()


def get_migration_status() -> dict:
    """Return current migration read-cutover status."""
    return {
        "read_postgres_pct": _READ_POSTGRES_PCT,
        "sqlite_primary": _READ_POSTGRES_PCT < 100,
    }
