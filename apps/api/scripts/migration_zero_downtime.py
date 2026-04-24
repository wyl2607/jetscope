#!/usr/bin/env python3
"""Zero-downtime migration script: SQLite -> PostgreSQL.

Implements the three-phase migration from migration_strategy.md:
  Phase 1: Backfill + dual write (SQLite primary, Postgres shadow)
  Phase 2: Gradual read cutover (READ_POSTGRES_PCT env var)
  Phase 3: Postgres primary, SQLite retired

Usage:
    # Phase 1: backfill historical data and enable dual write
    python migration_zero_downtime.py --phase 1 --sqlite-path ./data/market.db

    # Daily reconciliation during Phase 1/2
    python migration_zero_downtime.py --reconcile

    # Phase 3: final verification + cutover
    python migration_zero_downtime.py --phase 3 --strict

Environment:
    JETSCOPE_POSTGRES_URL   Postgres connection string, with SAFVSOIL_POSTGRES_URL as a legacy fallback
    DUAL_WRITE_PHASE        phase1 | phase2 | phase3
    READ_POSTGRES_PCT       0-100 (Phase 2 only)
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session

# Allow imports from apps/api
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db.base import Base
from app.db.postgres import create_postgres_engine
from app.db.sqlite import create_sqlite_engine
from app.models.tables import MarketRefreshRun, MarketSnapshot

DEFAULT_SQLITE_PATH = os.getenv("JETSCOPE_SQLITE_PATH", os.getenv("SAFVSOIL_SQLITE_PATH", "/opt/safvsoil/data/market.db"))
DEFAULT_POSTGRES_URL = os.getenv(
    "JETSCOPE_POSTGRES_URL",
    os.getenv("SAFVSOIL_POSTGRES_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/jetscope"),
)

# Tables that participate in dual-write migration
MIGRATION_TABLES = ["market_snapshots", "market_refresh_runs"]


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).isoformat()}] {msg}")


def get_row_counts(sqlite_session: Session, postgres_session: Session) -> dict[str, dict[str, int]]:
    """Return row counts per table for both databases."""
    result: dict[str, dict[str, int]] = {}
    for table in MIGRATION_TABLES:
        sq_count = sqlite_session.execute(text(f"SELECT count(*) FROM {table}")).scalar() or 0
        pg_count = postgres_session.execute(text(f"SELECT count(*) FROM {table}")).scalar() or 0
        result[table] = {"sqlite": sq_count, "postgres": pg_count, "diff": sq_count - pg_count}
    return result


def backfill_sqlite_to_postgres(sqlite_path: str, postgres_url: str, dry_run: bool = False) -> bool:
    """Copy all data from SQLite to PostgreSQL (idempotent)."""
    sqlite_engine = create_sqlite_engine(sqlite_path)
    postgres_engine = create_postgres_engine(postgres_url)

    with Session(sqlite_engine) as sq_sess, Session(postgres_engine) as pg_sess:
        log("Starting backfill...")

        # Ensure Postgres schema exists
        if not dry_run:
            Base.metadata.create_all(postgres_engine)
            log("Postgres schema ensured.")

        # Backfill market_snapshots
        snapshots = sq_sess.scalars(select(MarketSnapshot)).all()
        log(f"Found {len(snapshots)} market_snapshots in SQLite.")

        if not dry_run:
            for snap in snapshots:
                # Check for existing to avoid duplicates
                existing = pg_sess.scalar(
                    select(MarketSnapshot).where(
                        MarketSnapshot.metric_key == snap.metric_key,
                        MarketSnapshot.as_of == snap.as_of,
                    )
                )
                if existing is None:
                    pg_sess.add(
                        MarketSnapshot(
                            id=snap.id,
                            source_key=snap.source_key,
                            metric_key=snap.metric_key,
                            value=snap.value,
                            unit=snap.unit,
                            as_of=snap.as_of,
                            payload=snap.payload,
                        )
                    )
            pg_sess.commit()
            log("market_snapshots backfilled.")

        # Backfill market_refresh_runs
        runs = sq_sess.scalars(select(MarketRefreshRun)).all()
        log(f"Found {len(runs)} market_refresh_runs in SQLite.")

        if not dry_run:
            for run in runs:
                existing = pg_sess.scalar(
                    select(MarketRefreshRun).where(MarketRefreshRun.id == run.id)
                )
                if existing is None:
                    pg_sess.add(
                        MarketRefreshRun(
                            id=run.id,
                            refreshed_at=run.refreshed_at,
                            source_status=run.source_status,
                            sources=run.sources,
                            ingest=run.ingest,
                            payload=run.payload,
                        )
                    )
            pg_sess.commit()
            log("market_refresh_runs backfilled.")

    log("Backfill complete.")
    return True


def reconcile(sqlite_path: str, postgres_url: str, strict: bool = False) -> bool:
    """Run daily reconciliation check. Returns True if all good."""
    sqlite_engine = create_sqlite_engine(sqlite_path)
    postgres_engine = create_postgres_engine(postgres_url)

    with Session(sqlite_engine) as sq_sess, Session(postgres_engine) as pg_sess:
        counts = get_row_counts(sq_sess, pg_sess)

        all_ok = True
        log("--- Reconciliation Report ---")
        for table, vals in counts.items():
            status = "OK" if vals["diff"] == 0 else "MISMATCH"
            if strict and vals["diff"] != 0:
                all_ok = False
            log(f"  {table}: SQLite={vals['sqlite']} Postgres={vals['postgres']} Diff={vals['diff']} [{status}]")

        # Check latest snapshot freshness
        latest_pg = pg_sess.scalar(
            select(MarketSnapshot).order_by(MarketSnapshot.as_of.desc())
        )
        latest_sq = sq_sess.scalar(
            select(MarketSnapshot).order_by(MarketSnapshot.as_of.desc())
        )

        if latest_pg and latest_sq:
            pg_age = (datetime.now(timezone.utc) - latest_pg.as_of).total_seconds() // 60
            sq_age = (datetime.now(timezone.utc) - latest_sq.as_of).total_seconds() // 60
            log(f"  Latest snapshot age: Postgres={pg_age}m SQLite={sq_age}m")
            if abs(pg_age - sq_age) > 5:
                log("  WARNING: Freshness divergence > 5 minutes")
                if strict:
                    all_ok = False
        else:
            log("  WARNING: No snapshots found in one or both databases")
            if strict:
                all_ok = False

        log(f"--- Reconciliation {'PASSED' if all_ok else 'FAILED'} ---")
        return all_ok


def archive_sqlite(sqlite_path: str) -> str:
    """Create timestamped archive of SQLite database."""
    src = Path(sqlite_path)
    if not src.exists():
        raise FileNotFoundError(f"SQLite DB not found: {sqlite_path}")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = Path(sqlite_path).parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    dest = backup_dir / f"market_{timestamp}.db"

    import shutil

    shutil.copy2(src, dest)
    log(f"SQLite archived to {dest}")
    return str(dest)


def cutover_phase(phase: str, sqlite_path: str, postgres_url: str, strict: bool = False) -> bool:
    """Execute phase transition."""
    log(f"Executing cutover to {phase}...")

    if phase == "phase1":
        # Backfill + enable dual write
        backfill_sqlite_to_postgres(sqlite_path, postgres_url, dry_run=False)
        log("Phase 1 ready. Set DUAL_WRITE_PHASE=phase1 in environment.")
        return True

    elif phase == "phase2":
        # Verify Phase 1 is stable, then enable gradual read cutover
        if not reconcile(sqlite_path, postgres_url, strict=strict):
            log("Phase 2 blocked: reconciliation failed. Stay in Phase 1.")
            return False
        log("Phase 2 ready. Set DUAL_WRITE_PHASE=phase2 and READ_POSTGRES_PCT=10.")
        return True

    elif phase == "phase3":
        # Final verification, archive SQLite, Postgres only
        if not reconcile(sqlite_path, postgres_url, strict=True):
            log("Phase 3 blocked: strict reconciliation failed.")
            return False

        archive_path = archive_sqlite(sqlite_path)
        log(f"Phase 3 ready. SQLite archived at {archive_path}")
        log("Set DUAL_WRITE_PHASE=phase3 and READ_POSTGRES_PCT=100.")
        return True

    else:
        log(f"Unknown phase: {phase}")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Zero-downtime SQLite->PostgreSQL migration")
    parser.add_argument("--phase", choices=["1", "2", "3"], help="Migration phase to execute")
    parser.add_argument("--reconcile", action="store_true", help="Run reconciliation check")
    parser.add_argument("--sqlite-path", default=DEFAULT_SQLITE_PATH, help="SQLite DB path")
    parser.add_argument("--postgres-url", default=DEFAULT_POSTGRES_URL, help="Postgres URL")
    parser.add_argument("--strict", action="store_true", help="Fail on any discrepancy")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen")
    args = parser.parse_args()

    if args.phase:
        phase_name = f"phase{args.phase}"
        ok = cutover_phase(phase_name, args.sqlite_path, args.postgres_url, strict=args.strict)
        return 0 if ok else 1

    if args.reconcile:
        ok = reconcile(args.sqlite_path, args.postgres_url, strict=args.strict)
        return 0 if ok else 1

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
