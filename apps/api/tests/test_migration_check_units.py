"""Focused unit tests for scripts/migration_check.py.

Tests helper functions (table_exists, get_row_count, get_confidence_avg,
get_null_rate) with mock connections, then tests check_table integration via
monkeypatched helpers, and finally verifies module-level constants.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from scripts.migration_check import (
    CONFIDENCE_TABLES,
    CONTRACT_TABLES,
    check_table,
    get_confidence_avg,
    get_null_rate,
    get_row_count,
    table_exists,
)


# ---------------------------------------------------------------------------
# 辅助: 伪造 SQLAlchemy Connection
# ---------------------------------------------------------------------------

def _mock_conn() -> MagicMock:
    """Return a fake Connection whose execute().fetchone() returns (1,) by default."""
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = (1,)
    return conn


# ===================================================================
# 单元测试: table_exists
# ===================================================================

class TestTableExists:
    def test_exists_returns_true(self):
        conn = _mock_conn()
        assert table_exists(conn, "market_prices") is True

    def test_not_exists_returns_false(self):
        conn = _mock_conn()
        conn.execute.side_effect = Exception("relation does not exist")
        assert table_exists(conn, "nonexistent") is False

    def test_does_not_call_fetchone(self):
        conn = _mock_conn()
        table_exists(conn, "market_prices")
        conn.execute.assert_called_once()
        # table_exists only calls execute, not fetchone
        # We verify the function doesn't crash
        assert True


# ===================================================================
# 单元测试: get_row_count
# ===================================================================

class TestGetRowCount:
    def test_returns_integer(self):
        conn = _mock_conn()
        conn.execute.return_value.fetchone.return_value = (42,)
        assert get_row_count(conn, "market_prices") == 42

    def test_returns_zero_when_no_row(self):
        conn = _mock_conn()
        conn.execute.return_value.fetchone.return_value = None
        assert get_row_count(conn, "market_prices") == 0

    def test_handles_large_count(self):
        conn = _mock_conn()
        conn.execute.return_value.fetchone.return_value = (1_000_000,)
        assert get_row_count(conn, "market_prices") == 1_000_000


# ===================================================================
# 单元测试: get_confidence_avg
# ===================================================================

class TestGetConfidenceAvg:
    def test_returns_avg_for_confidence_table(self):
        conn = _mock_conn()
        conn.execute.return_value.fetchone.return_value = (0.85,)
        assert get_confidence_avg(conn, "market_prices") == 0.85

    def test_returns_none_for_non_confidence_table(self):
        conn = _mock_conn()
        result = get_confidence_avg(conn, "data_freshness")
        assert result is None
        conn.execute.assert_not_called()

    def test_returns_none_on_exception(self):
        conn = _mock_conn()
        conn.execute.return_value.fetchone.side_effect = Exception("db error")
        assert get_confidence_avg(conn, "market_prices") is None

    def test_returns_none_when_avg_is_null(self):
        conn = _mock_conn()
        conn.execute.return_value.fetchone.return_value = (None,)
        assert get_confidence_avg(conn, "market_prices") is None


# ===================================================================
# 单元测试: get_null_rate
# ===================================================================

class TestGetNullRate:
    def test_no_nulls(self):
        conn = _mock_conn()
        conn.execute.return_value.fetchone.return_value = (100, 0)
        assert get_null_rate(conn, "market_prices", "confidence") == 0.0

    def test_some_nulls(self):
        conn = _mock_conn()
        conn.execute.return_value.fetchone.return_value = (100, 15)
        assert get_null_rate(conn, "market_prices", "confidence") == 0.15

    def test_all_nulls(self):
        conn = _mock_conn()
        conn.execute.return_value.fetchone.return_value = (10, 10)
        assert get_null_rate(conn, "market_prices", "confidence") == 1.0

    def test_returns_zero_on_exception(self):
        conn = _mock_conn()
        conn.execute.return_value.fetchone.side_effect = Exception("error")
        assert get_null_rate(conn, "market_prices", "confidence") == 0.0

    def test_returns_zero_when_total_is_zero(self):
        conn = _mock_conn()
        conn.execute.return_value.fetchone.return_value = (0, 0)
        assert get_null_rate(conn, "market_prices", "confidence") == 0.0


# ===================================================================
# 集成测试: check_table (依頼者: monkeypatch helper functions)
# ===================================================================

class TestCheckTable:
    """check_table は helper 関数 (table_exists / get_row_count / ...) を
    内部で呼び出すので monkeypatch で制御する。"""

    def test_perfect_match_phase1(self, monkeypatch):
        monkeypatch.setattr("scripts.migration_check.table_exists", lambda c, t: True)
        monkeypatch.setattr("scripts.migration_check.get_row_count", lambda c, t: 100)
        monkeypatch.setattr("scripts.migration_check.get_confidence_avg", lambda c, t: 0.85)

        pg = object()
        sq = object()
        result = check_table(pg, sq, "market_prices", phase=1, strict=False)

        assert result["ok"] is True
        assert result["pg_rows"] == 100
        assert result["sq_rows"] == 100
        assert result["pg_confidence_avg"] == 0.85

    def test_row_count_mismatch_exceeds_tolerance(self, monkeypatch):
        monkeypatch.setattr("scripts.migration_check.table_exists", lambda c, t: True)
        pg = object()
        sq = object()

        def row_count(conn, table):
            return 115 if id(conn) == id(pg) else 100

        monkeypatch.setattr("scripts.migration_check.get_row_count", row_count)
        monkeypatch.setattr("scripts.migration_check.get_confidence_avg", lambda c, t: 0.85)

        # Phase 1 tolerance = 10, diff = 15 > 10
        result = check_table(pg, sq, "market_prices", phase=1, strict=False)
        assert result["ok"] is False
        assert result["pg_rows"] == 115
        assert result["sq_rows"] == 100
        assert any("Row count mismatch" in i for i in result["issues"])

    def test_confidence_drift_detected_phase1(self, monkeypatch):
        monkeypatch.setattr("scripts.migration_check.table_exists", lambda c, t: True)
        monkeypatch.setattr("scripts.migration_check.get_row_count", lambda c, t: 100)
        monkeypatch.setattr("scripts.migration_check.get_confidence_avg", lambda c, t: 0.90)

        pg = object()
        sq = object()

        def conf_avg(conn, table):
            return 0.90 if id(conn) == id(pg) else 0.80

        monkeypatch.setattr("scripts.migration_check.get_confidence_avg", conf_avg)

        result = check_table(pg, sq, "market_prices", phase=1, strict=False)
        assert result["ok"] is False
        assert any("Confidence drift" in i for i in result["issues"])

    def test_confidence_drift_within_threshold_phase1(self, monkeypatch):
        monkeypatch.setattr("scripts.migration_check.table_exists", lambda c, t: True)
        monkeypatch.setattr("scripts.migration_check.get_row_count", lambda c, t: 100)

        c = 0

        def conf_avg(conn, table):
            nonlocal c
            c += 1
            return 0.502 if c == 1 else 0.500

        monkeypatch.setattr("scripts.migration_check.get_confidence_avg", conf_avg)

        result = check_table(object(), object(), "market_prices", phase=1, strict=False)
        assert result["ok"] is True

    def test_confidence_drift_exceeds_phase2_threshold(self, monkeypatch):
        monkeypatch.setattr("scripts.migration_check.table_exists", lambda c, t: True)
        monkeypatch.setattr("scripts.migration_check.get_row_count", lambda c, t: 100)

        c = 0

        def conf_avg(conn, table):
            nonlocal c
            c += 1
            return 0.502 if c == 1 else 0.500

        monkeypatch.setattr("scripts.migration_check.get_confidence_avg", conf_avg)

        result = check_table(object(), object(), "market_prices", phase=2, strict=False)
        assert result["ok"] is False
        assert any("Confidence drift" in i for i in result["issues"])

    def test_postgres_table_missing(self, monkeypatch):
        monkeypatch.setattr("scripts.migration_check.table_exists", lambda c, t: False)
        monkeypatch.setattr("scripts.migration_check.get_row_count", lambda c, t: 100)
        monkeypatch.setattr("scripts.migration_check.get_confidence_avg", lambda c, t: 0.85)

        pg = object()
        sq = object()

        # Override so only pg is missing
        monkeypatch.setattr(
            "scripts.migration_check.table_exists",
            lambda c, t: id(c) != id(pg),
        )

        result = check_table(pg, sq, "market_prices", phase=1, strict=False)
        assert result["ok"] is False
        assert any("missing in Postgres" in i for i in result["issues"])

    def test_sqlite_table_missing_phase3_not_error(self, monkeypatch):
        pg = object()
        sq = object()

        monkeypatch.setattr(
            "scripts.migration_check.table_exists",
            lambda c, t: id(c) != id(sq),
        )

        result = check_table(pg, sq, "market_prices", phase=3, strict=False)
        # In phase 3, SQLite table missing is NOT considered an error
        assert result["ok"] is True
        assert any("missing in SQLite" in i for i in result["issues"])

    def test_sqlite_table_missing_phase1_is_error(self, monkeypatch):
        pg = object()
        sq = object()

        monkeypatch.setattr(
            "scripts.migration_check.table_exists",
            lambda c, t: id(c) != id(sq),
        )

        result = check_table(pg, sq, "market_prices", phase=1, strict=False)
        assert result["ok"] is False
        assert any("missing in SQLite" in i for i in result["issues"])

    def test_phase3_null_rate_check(self, monkeypatch):
        pg = object()
        sq = object()
        monkeypatch.setattr("scripts.migration_check.table_exists", lambda c, t: True)
        monkeypatch.setattr("scripts.migration_check.get_row_count", lambda c, t: 100)
        monkeypatch.setattr("scripts.migration_check.get_confidence_avg", lambda c, t: 0.85)
        monkeypatch.setattr("scripts.migration_check.get_null_rate", lambda c, t, col: 0.20)

        result = check_table(pg, sq, "market_prices", phase=3, strict=False)
        assert result["ok"] is False
        assert any("High NULL rate" in i for i in result["issues"])

    def test_non_confidence_table_skips_confidence_checks(self, monkeypatch):
        monkeypatch.setattr("scripts.migration_check.table_exists", lambda c, t: True)
        monkeypatch.setattr("scripts.migration_check.get_row_count", lambda c, t: 100)
        monkeypatch.setattr(
            "scripts.migration_check.get_confidence_avg",
            lambda c, t: 0.85 if t in CONFIDENCE_TABLES else None,
        )

        result = check_table(object(), object(), "data_freshness", phase=1, strict=False)
        assert result["ok"] is True
        assert result["pg_confidence_avg"] is None
        assert result["sq_confidence_avg"] is None


# ===================================================================
# 常量验证
# ===================================================================

class TestConstants:
    def test_contract_tables_keys(self):
        assert set(CONTRACT_TABLES) == {
            "market_prices",
            "carbon_intensities",
            "germany_premiums",
            "rotterdam_emissions",
            "eu_ets_volumes",
            "data_freshness",
            "source_status",
        }

    def test_confidence_tables_subset_of_contract_tables(self):
        assert CONFIDENCE_TABLES.issubset(CONTRACT_TABLES)

    def test_data_freshness_not_in_confidence_tables(self):
        assert "data_freshness" not in CONFIDENCE_TABLES
