from copy import deepcopy

import pytest

from app.schemas.reserves import ReserveStressResponse
from app.services.analysis.reserve_stress import (
    _MANUAL_FALLBACK,
    get_eu_reserve_stress,
)


class TestGetEuReserveStressNoDb:
    """get_eu_reserve_stress(db=None) — the no-DB path always returns the
    curated manual fallback."""

    def test_returns_manual_fallback_when_db_is_none(self):
        resp = get_eu_reserve_stress(db=None)
        assert resp.region == "eu"
        assert resp.coverage_days == 20
        assert resp.stress_level == "elevated"
        assert resp.supply_gap_pct == 25.0
        assert resp.source_type == "manual"
        assert resp.confidence == 0.62

    def test_returns_manual_fallback_when_db_omitted(self):
        resp = get_eu_reserve_stress()
        assert resp.source_type == "manual"
        assert resp.coverage_days == 20

    def test_returns_copy_not_same_object(self):
        resp = get_eu_reserve_stress()
        assert resp is not _MANUAL_FALLBACK

    def test_copy_is_independent(self):
        resp = get_eu_reserve_stress()
        resp.coverage_days = 99
        assert _MANUAL_FALLBACK.coverage_days == 20


class TestGetEuReserveStressWithDb:
    """get_eu_reserve_stress(db=…) — the DB path delegates to
    get_eu_reserve_stress_from_db and falls back on None."""

    def test_returns_live_data_when_db_has_rows(self, monkeypatch):
        live = ReserveStressResponse(
            region="eu",
            coverage_days=15,
            stress_level="critical",
            supply_gap_pct=50.0,
            source_type="official",
            confidence=0.85,
        )
        monkeypatch.setattr(
            "app.services.analysis.reserve_stress.get_eu_reserve_stress_from_db",
            lambda db: live,
        )
        resp = get_eu_reserve_stress(db=object())
        assert resp is live

    def test_falls_back_when_db_returns_none(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.analysis.reserve_stress.get_eu_reserve_stress_from_db",
            lambda db: None,
        )
        resp = get_eu_reserve_stress(db=object())
        assert resp.source_type == "manual"
        assert resp.coverage_days == 20

    def test_falls_back_when_db_has_empty_table(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.analysis.reserve_stress.get_eu_reserve_stress_from_db",
            lambda db: None,
        )
        resp = get_eu_reserve_stress(db=object())
        assert resp is not _MANUAL_FALLBACK
        assert resp.confidence == 0.62


class TestManualFallbackConstant:
    """Direct assertions on the module-level _MANUAL_FALLBACK."""

    def test_all_fields_match_contract(self):
        assert isinstance(_MANUAL_FALLBACK, ReserveStressResponse)
        assert _MANUAL_FALLBACK.region == "eu"
        assert _MANUAL_FALLBACK.coverage_days == 20
        assert _MANUAL_FALLBACK.stress_level == "elevated"
        assert _MANUAL_FALLBACK.supply_gap_pct == 25.0
        assert _MANUAL_FALLBACK.source_type == "manual"
        assert _MANUAL_FALLBACK.confidence == 0.62
        assert _MANUAL_FALLBACK.observed_at is None
