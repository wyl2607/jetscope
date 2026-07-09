from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "migration_check.py"
SPEC = importlib.util.spec_from_file_location("migration_check", MODULE_PATH)
assert SPEC is not None
migration_check = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules.setdefault(
    "sqlalchemy",
    types.SimpleNamespace(create_engine=lambda *args, **kwargs: None, text=lambda sql: sql),
)
SPEC.loader.exec_module(migration_check)


class FakeResult:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class FakeConnection:
    def __init__(self, tables):
        self.tables = tables

    def execute(self, statement):
        sql = str(statement)
        table = _table_name(sql)
        if table not in self.tables:
            raise RuntimeError(f"missing table: {table}")

        rows = self.tables[table]
        if sql.startswith("SELECT 1 FROM"):
            return FakeResult((1,))
        if sql.startswith("SELECT count(*) FROM"):
            return FakeResult((len(rows),))
        if sql.startswith("SELECT avg(confidence) FROM"):
            values = [row["confidence"] for row in rows if row.get("confidence") is not None]
            avg = sum(values) / len(values) if values else None
            return FakeResult((avg,))
        if "sum(CASE WHEN confidence IS NULL" in sql:
            nulls = sum(1 for row in rows if row.get("confidence") is None)
            return FakeResult((len(rows), nulls))

        raise AssertionError(f"unexpected SQL: {sql}")


def _table_name(sql: str) -> str:
    after_from = sql.split(" FROM ", 1)[1]
    return after_from.split()[0]


def test_phase_one_allows_small_row_difference_and_loose_confidence_drift():
    pg_conn = FakeConnection({"market_prices": [{"confidence": 0.90} for _ in range(12)]})
    sq_conn = FakeConnection({"market_prices": [{"confidence": 0.87} for _ in range(7)]})

    result = migration_check.check_table(pg_conn, sq_conn, "market_prices", phase=1, strict=False)

    assert result["ok"] is True
    assert result["pg_rows"] == 12
    assert result["sq_rows"] == 7
    assert result["pg_confidence_avg"] == 0.9
    assert result["sq_confidence_avg"] == 0.87
    assert result["issues"] == []


def test_phase_two_rejects_any_row_mismatch_and_tight_confidence_drift():
    pg_conn = FakeConnection({"market_prices": [{"confidence": 0.90} for _ in range(3)]})
    sq_conn = FakeConnection({"market_prices": [{"confidence": 0.80} for _ in range(2)]})

    result = migration_check.check_table(pg_conn, sq_conn, "market_prices", phase=2, strict=False)

    issues = "\n".join(result["issues"])

    assert result["ok"] is False
    assert result["pg_rows"] == 3
    assert result["sq_rows"] == 2
    assert "Row count mismatch: pg=3 sq=2 diff=1 (tolerance=0)" in issues
    assert "Confidence drift: pg=0.9000 sq=0.8000 diff=0.1000 (threshold=0.001)" in issues


def test_strict_mode_rejects_high_postgres_confidence_null_rate():
    pg_conn = FakeConnection(
        {
            "source_status": [
                {"confidence": None},
                {"confidence": 0.80},
                {"confidence": 0.80},
                {"confidence": 0.80},
            ]
        }
    )
    sq_conn = FakeConnection({"source_status": [{"confidence": 0.80} for _ in range(4)]})

    result = migration_check.check_table(pg_conn, sq_conn, "source_status", phase=1, strict=True)

    assert result["ok"] is False
    assert result["pg_rows"] == result["sq_rows"] == 4
    assert result["pg_confidence_avg"] == 0.8000000000000002
    assert result["sq_confidence_avg"] == 0.8
    assert result["issues"] == ["High NULL rate in confidence: 25.0% (threshold=5%)"]


def test_missing_sqlite_table_is_allowed_only_in_phase_three():
    pg_conn = FakeConnection({"eu_ets_volumes": [{"confidence": 0.95}]})
    sq_conn = FakeConnection({})

    phase_two = migration_check.check_table(pg_conn, sq_conn, "eu_ets_volumes", phase=2, strict=False)
    phase_three = migration_check.check_table(pg_conn, sq_conn, "eu_ets_volumes", phase=3, strict=False)

    assert phase_two["ok"] is False
    assert phase_two["issues"] == ["Table 'eu_ets_volumes' missing in SQLite"]
    assert phase_three["ok"] is True
    assert phase_three["issues"] == ["Table 'eu_ets_volumes' missing in SQLite"]
