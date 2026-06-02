"""Focused unit tests for reserve stress fallback and DB delegation behavior."""

from __future__ import annotations

from app.schemas.reserves import ReserveStressResponse
from app.services.analysis import reserve_stress


def test_get_eu_reserve_stress_without_db_returns_fallback_copy(monkeypatch) -> None:
    def _should_not_be_called(_db):  # noqa: ANN001
        raise AssertionError("DB helper must not be called when db=None")

    monkeypatch.setattr(reserve_stress, "get_eu_reserve_stress_from_db", _should_not_be_called)

    first = reserve_stress.get_eu_reserve_stress()
    second = reserve_stress.get_eu_reserve_stress()

    assert first.region == "eu"
    assert first.coverage_days == 20
    assert first.stress_level == "elevated"
    assert first.source_type == "manual"
    assert first.confidence == 0.62
    assert first is not second


def test_get_eu_reserve_stress_with_db_returns_live_value(monkeypatch) -> None:
    db = object()
    live = ReserveStressResponse(
        region="eu",
        coverage_days=27,
        stress_level="stable",
        supply_gap_pct=0.0,
        source_type="official",
        confidence=0.91,
    )
    calls: list[object] = []

    def _fake_get_from_db(passed_db: object) -> ReserveStressResponse:
        calls.append(passed_db)
        return live

    monkeypatch.setattr(reserve_stress, "get_eu_reserve_stress_from_db", _fake_get_from_db)

    result = reserve_stress.get_eu_reserve_stress(db)

    assert calls == [db]
    assert result is live
    assert result.source_type == "official"


def test_get_eu_reserve_stress_with_db_falls_back_when_live_missing(monkeypatch) -> None:
    db = object()
    calls: list[object] = []

    def _fake_get_from_db(passed_db: object):
        calls.append(passed_db)
        return None

    monkeypatch.setattr(reserve_stress, "get_eu_reserve_stress_from_db", _fake_get_from_db)

    first = reserve_stress.get_eu_reserve_stress(db)
    second = reserve_stress.get_eu_reserve_stress(db)

    assert calls == [db, db]
    assert first.source_type == "manual"
    assert first.coverage_days == 20
    assert first is not second

