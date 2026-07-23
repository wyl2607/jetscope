"""Focused unit tests for app.services.reserves with offline-safe fakes."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.services import reserves


class FakeScalarResult:
    def __init__(self, row):
        self._row = row

    def first(self):
        return self._row


class FakeSessionForLatest:
    def __init__(self, rows_in_query_order):
        self.rows_in_query_order = list(rows_in_query_order)
        self._cursor = 0

    def scalars(self, _query):
        row = self.rows_in_query_order[self._cursor]
        self._cursor += 1
        return FakeScalarResult(row)


class FakeDB:
    def __init__(self):
        self.added = []
        self.commit_calls = 0

    def add(self, row):
        self.added.append(row)

    def commit(self):
        self.commit_calls += 1


def _row(iso: str, stock_days: float, source: str, confidence: float, timestamp: datetime):
    return SimpleNamespace(
        country_iso=iso,
        stock_days=stock_days,
        source=source,
        confidence=confidence,
        timestamp=timestamp,
    )


def test_stress_level_and_supply_gap_thresholds():
    assert reserves._stress_level(13.9) == "critical"
    assert reserves._stress_level(14.0) == "elevated"
    assert reserves._stress_level(21.0) == "guarded"
    assert reserves._stress_level(28.0) == "normal"

    assert reserves._supply_gap_pct(50.0) == 0.0
    assert reserves._supply_gap_pct(10.0) == 100.0
    assert reserves._supply_gap_pct(30.0) == 50.0


def test_latest_coverage_per_country_keeps_only_present_rows():
    ts = datetime(2026, 1, 1, tzinfo=timezone.utc)
    de_row = _row("DE", 20.0, "iea_oil_market_report", 0.9, ts)
    db = FakeSessionForLatest(rows_in_query_order=[de_row, None])

    result = reserves.latest_coverage_per_country(db, countries=("DE", "FR"))

    assert set(result.keys()) == {"DE"}
    assert result["DE"] is de_row


def test_get_eu_reserve_stress_from_db_aggregates_and_normalizes_naive_timestamp(monkeypatch):
    later_naive = datetime(2026, 1, 2, 12, 0, 0)
    rows = {
        "DE": _row("DE", 18.2, "iea_oil_market_report", 0.91, later_naive),
        "FR": _row("FR", 21.8, "manual_estimate", 0.73, datetime(2026, 1, 1, 10, 0, 0)),
    }

    monkeypatch.setattr(reserves, "latest_coverage_per_country", lambda _db: rows)

    response = reserves.get_eu_reserve_stress_from_db(db=object())

    assert response is not None
    assert response.region == "eu"
    assert response.coverage_days == 20
    assert response.stress_level == "elevated"
    assert response.supply_gap_pct == 75.0
    assert response.source_type == "official"
    assert response.confidence == 0.82
    assert response.observed_at.tzinfo == timezone.utc


def test_get_eu_reserve_stress_from_db_raises_for_mixed_naive_and_aware(monkeypatch):
    rows = {
        "DE": _row("DE", 18.0, "iea_oil_market_report", 0.9, datetime(2026, 1, 2, 12, 0, 0)),
        "FR": _row("FR", 22.0, "manual_estimate", 0.8, datetime(2026, 1, 1, tzinfo=timezone.utc)),
    }

    monkeypatch.setattr(reserves, "latest_coverage_per_country", lambda _db: rows)

    import pytest

    with pytest.raises(TypeError):
        reserves.get_eu_reserve_stress_from_db(db=object())


def test_refresh_reserves_coverage_persists_one_row_per_country_and_commits_once():
    db = FakeDB()

    class FakeAdapter:
        def fetch_stock_days_coverage(self, _iso):
            return SimpleNamespace(
                stock_days=22,
                source="iea_oil_market_report",
                confidence=0.95,
                timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
            )

    inserted = reserves.refresh_reserves_coverage(db, adapter=FakeAdapter())

    assert inserted == len(reserves.EU_COUNTRIES)
    assert len(db.added) == len(reserves.EU_COUNTRIES)
    assert db.commit_calls == 1
    assert {row.country_iso for row in db.added} == set(reserves.EU_COUNTRIES)
    assert all(row.stock_days == 22.0 for row in db.added)


def test_refresh_reserves_coverage_skips_failed_country_and_continues():
    db = FakeDB()

    class PartiallyFailingAdapter:
        def fetch_stock_days_coverage(self, iso):
            if iso == "FR":
                raise RuntimeError("simulated upstream failure")
            return SimpleNamespace(
                stock_days=19.5,
                source="iea_oil_market_report",
                confidence=0.88,
                timestamp=datetime(2026, 2, 1, tzinfo=timezone.utc),
            )

    inserted = reserves.refresh_reserves_coverage(db, adapter=PartiallyFailingAdapter())

    assert inserted == len(reserves.EU_COUNTRIES) - 1
    assert len(db.added) == len(reserves.EU_COUNTRIES) - 1
    assert db.commit_calls == 1
    assert "FR" not in {row.country_iso for row in db.added}
