"""Dual-write abstraction for zero-downtime PostgreSQL migration.

Supports three phases:
  Phase 1: Write to both SQLite (primary read) and Postgres (shadow).
  Phase 2: Gradual read cutover via READ_POSTGRES_PCT env var.
  Phase 3: Postgres only; SQLite write path retired.

Usage:
    from app.db.dual_write import get_write_dbs, get_read_db

    # Writes
    for db in get_write_dbs():
        write_metric(db, metric, data)

    # Reads (respects READ_POSTGRES_PCT)
    db = next(get_read_db())
"""

import os
import random
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy.orm import Session

from app.db.postgres import get_postgres_db
from app.db.sqlite import get_sqlite_db


# Phase control (set via environment)
#   phase1  -> dual write, sqlite read
#   phase2  -> dual write, gradual postgres read
#   phase3  -> postgres only
_DUAL_WRITE_PHASE = os.getenv("DUAL_WRITE_PHASE", "phase1").lower()
_READ_POSTGRES_PCT = int(os.getenv("READ_POSTGRES_PCT", "0"))


def get_write_dbs() -> Generator[Session, None, None]:
    """Yield database sessions that should receive writes.

    Phase 1/2: SQLite + Postgres
    Phase 3: Postgres only
    """
    if _DUAL_WRITE_PHASE in ("phase1", "phase2"):
        # Yield SQLite first (legacy primary), then Postgres
        yield from get_sqlite_db()
        yield from get_postgres_db()
    else:
        # Phase 3: Postgres only
        yield from get_postgres_db()


@contextmanager
def dual_write_context() -> Generator[list[Session], None, None]:
    """Context manager that yields a list of write sessions.

    Guarantees cleanup for all sessions.
    """
    sessions: list[Session] = []
    try:
        for db in get_write_dbs():
            sessions.append(db)
        yield sessions
    finally:
        for db in sessions:
            db.close()


def get_read_db() -> Generator[Session, None, None]:
    """Yield a single read database session.

    Respects READ_POSTGRES_PCT for gradual cutover:
      0   -> always SQLite
      10  -> 10% Postgres, 90% SQLite
      100 -> always Postgres
    """
    pct = _READ_POSTGRES_PCT
    if _DUAL_WRITE_PHASE == "phase3":
        pct = 100

    use_postgres = random.randint(1, 100) <= pct
    if use_postgres:
        yield from get_postgres_db()
    else:
        yield from get_sqlite_db()


def is_postgres_primary() -> bool:
    """Return True if Postgres is the primary read source."""
    return _DUAL_WRITE_PHASE == "phase3" or _READ_POSTGRES_PCT >= 100


def migration_status() -> dict:
    """Return current migration phase status for health checks."""
    return {
        "phase": _DUAL_WRITE_PHASE,
        "read_postgres_pct": _READ_POSTGRES_PCT,
        "postgres_primary": is_postgres_primary(),
        "write_targets": ["postgres"] if _DUAL_WRITE_PHASE == "phase3" else ["sqlite", "postgres"],
    }
