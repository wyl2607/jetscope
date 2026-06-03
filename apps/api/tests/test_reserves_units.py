"""Focused unit tests for apps/api/app/api/routes/reserves.py.

Tests route registration and endpoint behavior with zero DB overhead
by monkeypatching the service-layer function.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import FastAPI, APIRouter
from fastapi.testclient import TestClient

from app.api.routes.reserves import router
from app.db.session import get_db
from app.schemas.reserves import ReserveSignalResponse


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _fake_signal(**overrides: object) -> ReserveSignalResponse:
    data: dict[str, object] = dict(
        generated_at=datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc),
        region="eu",
        coverage_days=20,
        coverage_weeks=round(20.0 / 7, 2),
        stress_level="elevated",
        estimated_supply_gap_pct=25.0,
        source_type="manual",
        source_name="IATA / EUROCONTROL curated estimate",
        confidence_score=0.62,
    )
    data.update(overrides)
    return ReserveSignalResponse(**data)


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/reserves")
    app.dependency_overrides[get_db] = lambda: None
    return app


# ---------------------------------------------------------------------------
# route registration (no mocking, no DB)
# ---------------------------------------------------------------------------

class TestRouteRegistration:
    def test_router_is_apirouter(self) -> None:
        assert isinstance(router, APIRouter)

    def test_has_correct_path_and_method(self) -> None:
        sigs = {(r.path, frozenset(r.methods)) for r in router.routes}
        assert ("/eu", frozenset({"GET"})) in sigs


# ---------------------------------------------------------------------------
# GET /reserves/eu  —  service layer mocked
# ---------------------------------------------------------------------------

class TestGetEuReserveSignal:
    """Unit tests that mock build_eu_reserve_signal_response to avoid any DB."""

    def test_returns_200_with_manual_fallback_shape(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import app.api.routes.reserves as mod
        monkeypatch.setattr(mod, "build_eu_reserve_signal_response", lambda db: _fake_signal())
        client = TestClient(_make_app())

        resp = client.get("/reserves/eu")
        assert resp.status_code == 200
        data = resp.json()
        assert data["region"] == "eu"
        assert data["coverage_days"] == 20
        assert data["stress_level"] == "elevated"
        assert data["source_type"] == "manual"

    def test_official_source_response(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import app.api.routes.reserves as mod
        monkeypatch.setattr(
            mod, "build_eu_reserve_signal_response",
            lambda db: _fake_signal(
                coverage_days=24,
                coverage_weeks=round(24.0 / 7, 2),
                source_type="official",
                source_name="IEA Oil Market Report",
                confidence_score=0.85,
            ),
        )
        client = TestClient(_make_app())

        resp = client.get("/reserves/eu")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_type"] == "official"
        assert data["source_name"] == "IEA Oil Market Report"
        assert data["confidence_score"] == 0.85

    def test_coverage_weeks_derived_from_coverage_days(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import app.api.routes.reserves as mod
        monkeypatch.setattr(
            mod, "build_eu_reserve_signal_response",
            lambda db: _fake_signal(coverage_days=35, coverage_weeks=5.0),
        )
        client = TestClient(_make_app())

        resp = client.get("/reserves/eu")
        assert resp.status_code == 200
        data = resp.json()
        assert data["coverage_days"] == 35
        assert data["coverage_weeks"] == 5.0

    def test_critical_stress_level(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import app.api.routes.reserves as mod
        monkeypatch.setattr(
            mod, "build_eu_reserve_signal_response",
            lambda db: _fake_signal(
                coverage_days=10,
                coverage_weeks=round(10.0 / 7, 2),
                stress_level="critical",
                estimated_supply_gap_pct=100.0,
            ),
        )
        client = TestClient(_make_app())

        resp = client.get("/reserves/eu")
        assert resp.status_code == 200
        data = resp.json()
        assert data["stress_level"] == "critical"
        assert data["estimated_supply_gap_pct"] == 100.0
        assert data["coverage_days"] == 10
