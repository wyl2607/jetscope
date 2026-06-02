from __future__ import annotations

import sys
import types
from importlib.util import find_spec
from pathlib import Path
from types import SimpleNamespace

import pytest

API_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_ROOT = API_ROOT / "scripts"
for path in (API_ROOT, SCRIPTS_ROOT):
    sys.path.insert(0, str(path))

if find_spec("sqlalchemy") is None:
    sqlalchemy_stub = types.ModuleType("sqlalchemy")
    sqlalchemy_stub.create_engine = lambda *args, **kwargs: None
    sqlalchemy_stub.inspect = lambda *args, **kwargs: None
    sqlalchemy_stub.select = lambda *args, **kwargs: None
    sqlalchemy_stub.text = lambda statement: statement

    orm_stub = types.ModuleType("sqlalchemy.orm")
    orm_stub.Session = object

    base_stub = types.ModuleType("app.db.base")
    base_stub.Base = SimpleNamespace(metadata=SimpleNamespace(create_all=lambda engine: None))

    postgres_stub = types.ModuleType("app.db.postgres")
    postgres_stub.create_postgres_engine = lambda postgres_url: object()

    sqlite_stub = types.ModuleType("app.db.sqlite")
    sqlite_stub.create_sqlite_engine = lambda sqlite_path: object()

    tables_stub = types.ModuleType("app.models.tables")
    tables_stub.MarketRefreshRun = type("MarketRefreshRun", (), {})
    tables_stub.MarketSnapshot = type("MarketSnapshot", (), {})

    sys.modules.setdefault("sqlalchemy", sqlalchemy_stub)
    sys.modules.setdefault("sqlalchemy.orm", orm_stub)
    sys.modules.setdefault("app.db.base", base_stub)
    sys.modules.setdefault("app.db.postgres", postgres_stub)
    sys.modules.setdefault("app.db.sqlite", sqlite_stub)
    sys.modules.setdefault("app.models.tables", tables_stub)

import migration_zero_downtime as migration


class _ScalarResult:
    def __init__(self, value: int) -> None:
        self._value = value

    def scalar(self) -> int:
        return self._value


class _CountSession:
    def __init__(self, counts: dict[str, int]) -> None:
        self.counts = counts
        self.queries: list[str] = []

    def execute(self, statement: object) -> _ScalarResult:
        query = str(statement)
        self.queries.append(query)
        table = query.rsplit("FROM ", 1)[1]
        return _ScalarResult(self.counts[table])


def test_get_row_counts_reports_sqlite_postgres_and_diff_per_migration_table() -> None:
    sqlite = _CountSession({"market_snapshots": 7, "market_refresh_runs": 2})
    postgres = _CountSession({"market_snapshots": 5, "market_refresh_runs": 2})

    counts = migration.get_row_counts(sqlite, postgres)

    assert counts == {
        "market_snapshots": {"sqlite": 7, "postgres": 5, "diff": 2},
        "market_refresh_runs": {"sqlite": 2, "postgres": 2, "diff": 0},
    }
    assert sqlite.queries == [
        "SELECT count(*) FROM market_snapshots",
        "SELECT count(*) FROM market_refresh_runs",
    ]
    assert postgres.queries == sqlite.queries


def test_archive_sqlite_copies_database_into_timestamped_backup_dir(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sqlite_path = tmp_path / "market.db"
    sqlite_path.write_bytes(b"sqlite contents")

    class _FixedDateTime:
        @classmethod
        def now(cls, tz: object = None) -> SimpleNamespace:
            return SimpleNamespace(strftime=lambda fmt: "20260102_030405")

    monkeypatch.setattr(migration, "datetime", _FixedDateTime)
    messages: list[str] = []
    monkeypatch.setattr(migration, "log", messages.append)

    archived = migration.archive_sqlite(str(sqlite_path))

    archive_path = tmp_path / "backups" / "market_20260102_030405.db"
    assert archived == str(archive_path)
    assert archive_path.read_bytes() == b"sqlite contents"
    assert sqlite_path.read_bytes() == b"sqlite contents"
    assert messages == [f"SQLite archived to {archive_path}"]


def test_archive_sqlite_raises_when_source_database_is_missing(tmp_path: Path) -> None:
    missing_path = tmp_path / "missing.db"

    with pytest.raises(FileNotFoundError, match=f"SQLite DB not found: {missing_path}"):
        migration.archive_sqlite(str(missing_path))


def test_cutover_phase3_requires_strict_reconcile_before_archiving(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[object, ...]] = []

    def fake_reconcile(sqlite_path: str, postgres_url: str, strict: bool = False) -> bool:
        calls.append(("reconcile", sqlite_path, postgres_url, strict))
        return True

    def fake_archive(sqlite_path: str) -> str:
        calls.append(("archive", sqlite_path))
        return "/tmp/archive.db"

    monkeypatch.setattr(migration, "reconcile", fake_reconcile)
    monkeypatch.setattr(migration, "archive_sqlite", fake_archive)
    monkeypatch.setattr(migration, "log", lambda msg: None)

    assert migration.cutover_phase("phase3", "source.db", "postgres://db", strict=False) is True
    assert calls == [
        ("reconcile", "source.db", "postgres://db", True),
        ("archive", "source.db"),
    ]


def test_cutover_phase2_blocks_when_reconciliation_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str, bool]] = []

    def fake_reconcile(sqlite_path: str, postgres_url: str, strict: bool = False) -> bool:
        calls.append((sqlite_path, postgres_url, strict))
        return False

    monkeypatch.setattr(migration, "reconcile", fake_reconcile)
    monkeypatch.setattr(migration, "log", lambda msg: None)

    assert migration.cutover_phase("phase2", "source.db", "postgres://db", strict=True) is False
    assert calls == [("source.db", "postgres://db", True)]


def test_main_maps_phase_argument_to_cutover_and_exit_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, str, str, bool]] = []

    def fake_cutover(phase: str, sqlite_path: str, postgres_url: str, strict: bool = False) -> bool:
        calls.append((phase, sqlite_path, postgres_url, strict))
        return False

    monkeypatch.setattr(migration, "cutover_phase", fake_cutover)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "migration_zero_downtime.py",
            "--phase",
            "2",
            "--sqlite-path",
            "source.db",
            "--postgres-url",
            "postgres://db",
            "--strict",
        ],
    )

    assert migration.main() == 1
    assert calls == [("phase2", "source.db", "postgres://db", True)]


def test_main_reconcile_mode_returns_success_exit_code(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str, bool]] = []

    def fake_reconcile(sqlite_path: str, postgres_url: str, strict: bool = False) -> bool:
        calls.append((sqlite_path, postgres_url, strict))
        return True

    monkeypatch.setattr(migration, "reconcile", fake_reconcile)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "migration_zero_downtime.py",
            "--reconcile",
            "--sqlite-path",
            "source.db",
            "--postgres-url",
            "postgres://db",
        ],
    )

    assert migration.main() == 0
    assert calls == [("source.db", "postgres://db", False)]
