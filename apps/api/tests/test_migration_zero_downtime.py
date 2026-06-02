from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from scripts import migration_zero_downtime as migration


class FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeSession:
    def __init__(self, *, scalars_results=None, scalar_results=None, fail_commit_on=None):
        self._scalars_results = list(scalars_results or [])
        self._scalar_results = list(scalar_results or [])
        self.fail_commit_on = fail_commit_on
        self.added = []
        self.commit_count = 0
        self.rollback_count = 0
        self.scalars_call_count = 0
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        if exc_type is not None:
            self.rollback()
        self.closed = True
        return False

    def scalars(self, statement):
        self.scalars_call_count += 1
        return FakeScalarResult(self._scalars_results.pop(0))

    def scalar(self, statement):
        return self._scalar_results.pop(0)

    def add(self, row):
        self.added.append(row)

    def commit(self):
        self.commit_count += 1
        if self.fail_commit_on == self.commit_count:
            raise RuntimeError("postgres commit failed")

    def rollback(self):
        self.rollback_count += 1


def install_database_fakes(monkeypatch, sqlite_session, postgres_session):
    engines = {"sqlite": object(), "postgres": object()}
    created_schema_for = []

    monkeypatch.setattr(migration, "create_sqlite_engine", lambda sqlite_path: engines["sqlite"])
    monkeypatch.setattr(migration, "create_postgres_engine", lambda postgres_url: engines["postgres"])
    monkeypatch.setattr(
        migration.Base.metadata,
        "create_all",
        lambda engine: created_schema_for.append(engine),
    )

    def session_for(engine):
        if engine is engines["sqlite"]:
            return sqlite_session
        if engine is engines["postgres"]:
            return postgres_session
        raise AssertionError(f"unexpected engine: {engine!r}")

    monkeypatch.setattr(migration, "Session", session_for)
    return engines, created_schema_for


def snapshot_row():
    return SimpleNamespace(
        id=7,
        source_key="fred",
        metric_key="cpi",
        value=3.14,
        unit="pct",
        as_of=datetime(2026, 5, 28, tzinfo=timezone.utc),
        payload={"source": "test"},
    )


def refresh_run_row():
    return SimpleNamespace(
        id=11,
        refreshed_at=datetime(2026, 5, 28, tzinfo=timezone.utc),
        source_status={"fred": "ok"},
        sources={"fred": {"rows": 1}},
        ingest={"duration_ms": 12},
    )


def test_backfill_dry_run_reads_source_but_skips_schema_writes_and_commits(monkeypatch):
    sqlite_session = FakeSession(scalars_results=[[snapshot_row()], [refresh_run_row()]])
    postgres_session = FakeSession()
    _, created_schema_for = install_database_fakes(monkeypatch, sqlite_session, postgres_session)

    ok = migration.backfill_sqlite_to_postgres(
        "/tmp/source.sqlite",
        "postgresql://example/test",
        dry_run=True,
    )

    assert ok is True
    assert created_schema_for == []
    assert sqlite_session.scalars_call_count == 2
    assert postgres_session.added == []
    assert postgres_session.commit_count == 0


def test_backfill_copies_missing_rows_and_commits_each_table(monkeypatch):
    sqlite_session = FakeSession(scalars_results=[[snapshot_row()], [refresh_run_row()]])
    postgres_session = FakeSession(scalar_results=[None, None])
    engines, created_schema_for = install_database_fakes(monkeypatch, sqlite_session, postgres_session)

    ok = migration.backfill_sqlite_to_postgres(
        "/tmp/source.sqlite",
        "postgresql://example/test",
        dry_run=False,
    )

    assert ok is True
    assert created_schema_for == [engines["postgres"]]
    assert postgres_session.commit_count == 2
    assert [type(row) for row in postgres_session.added] == [
        migration.MarketSnapshot,
        migration.MarketRefreshRun,
    ]
    assert postgres_session.added[0].metric_key == "cpi"
    assert postgres_session.added[1].source_status == {"fred": "ok"}


def test_backfill_rolls_back_and_stops_when_postgres_commit_fails(monkeypatch):
    sqlite_session = FakeSession(scalars_results=[[snapshot_row()], [refresh_run_row()]])
    postgres_session = FakeSession(scalar_results=[None], fail_commit_on=1)
    _, created_schema_for = install_database_fakes(monkeypatch, sqlite_session, postgres_session)

    with pytest.raises(RuntimeError, match="postgres commit failed"):
        migration.backfill_sqlite_to_postgres(
            "/tmp/source.sqlite",
            "postgresql://example/test",
            dry_run=False,
        )

    assert created_schema_for
    assert sqlite_session.scalars_call_count == 1
    assert postgres_session.commit_count == 1
    assert postgres_session.rollback_count == 1
    assert [type(row) for row in postgres_session.added] == [migration.MarketSnapshot]
