from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router
from app.db.session import get_db
from app.schemas.market import (
    MarketHistoryBackfillResponse,
    MarketHistoryPoint,
    MarketHistoryResponse,
    MarketMetricHistory,
    MarketRefreshResponse,
    MarketSnapshotResponse,
    MarketSourceDetail,
    SourceStatus,
)
from app.services.bootstrap import utcnow


@pytest.fixture
def mock_db():
    return MagicMock()


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, mock_db: MagicMock):
    monkeypatch.setenv("JETSCOPE_ADMIN_TOKEN", "test-admin-token-999")

    # Reload config so settings picks up the env override
    import importlib
    from app.core import config
    importlib.reload(config)

    # Also patch the live settings reference that security.py already imported
    from app.security import settings as security_settings
    monkeypatch.setattr(security_settings, "admin_token", "test-admin-token-999")

    app = FastAPI(title="market-route-test")
    app.include_router(api_router, prefix="/v1")

    def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


# ── Helper factories for realistic responses ─────────────────────────────────


def _make_snapshot_response() -> MarketSnapshotResponse:
    now = utcnow()
    return MarketSnapshotResponse(
        generated_at=now,
        source_status=SourceStatus(
            overall="ok",
            confidence=0.85,
            freshness_minutes=5,
            fallback_rate=0.0,
            is_fallback=False,
        ),
        values={
            "brent_usd_per_bbl": 82.5,
            "jet_usd_per_l": 0.72,
            "carbon_proxy_usd_per_t": 92.3,
            "jet_eu_proxy_usd_per_l": 0.78,
            "rotterdam_jet_fuel_usd_per_l": 0.76,
            "eu_ets_price_eur_per_t": 68.4,
            "germany_premium_pct": 3.2,
        },
        source_details={
            "brent": MarketSourceDetail(
                source="eia", status="ok", region="global",
                market_scope="physical_spot_benchmark", confidence_score=0.88,
                value=82.5,
            ),
            "jet": MarketSourceDetail(
                source="fred", status="ok", region="us",
                market_scope="statistical_series", confidence_score=0.78,
                value=0.72,
            ),
        },
    )


def _make_history_response() -> MarketHistoryResponse:
    now = utcnow()
    return MarketHistoryResponse(
        generated_at=now,
        windows_days=[1, 7, 30],
        metrics={
            "brent_usd_per_bbl": MarketMetricHistory(
                metric_key="brent_usd_per_bbl",
                unit="USD/bbl",
                latest_value=82.5,
                latest_as_of=now,
                change_pct_1d=0.5,
                change_pct_7d=-2.1,
                change_pct_30d=5.3,
                points=[
                    MarketHistoryPoint(as_of=now, value=82.5),
                ],
            ),
        },
    )


# ── GET /market/snapshot ────────────────────────────────────────────────────


def test_get_market_snapshot_returns_200_with_correct_shape(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
):
    fake_response = _make_snapshot_response()
    monkeypatch.setattr(
        "app.api.routes.market.build_market_snapshot_response",
        lambda db: fake_response,
    )

    response = client.get("/v1/market/snapshot")
    assert response.status_code == 200
    payload = response.json()
    assert payload["source_status"]["overall"] == "ok"
    assert payload["source_status"]["confidence"] == 0.85
    assert payload["values"]["brent_usd_per_bbl"] == 82.5
    assert payload["values"]["jet_usd_per_l"] == 0.72
    assert "brent" in payload["source_details"]
    assert payload["source_details"]["brent"]["source"] == "eia"


def test_get_market_snapshot_delegates_to_service(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, mock_db: MagicMock
):
    fake = _make_snapshot_response()
    calls = []
    def spy(db):
        calls.append(db)
        return fake

    monkeypatch.setattr("app.api.routes.market.build_market_snapshot_response", spy)
    client.get("/v1/market/snapshot")
    assert len(calls) == 1
    assert calls[0] is mock_db


# ── GET /market/history ──────────────────────────────────────────────────────


def test_get_market_history_returns_200_with_metrics(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
):
    fake = _make_history_response()
    monkeypatch.setattr(
        "app.api.routes.market.build_market_history_response",
        lambda db: fake,
    )

    response = client.get("/v1/market/history")
    assert response.status_code == 200
    payload = response.json()
    assert "brent_usd_per_bbl" in payload["metrics"]
    metric = payload["metrics"]["brent_usd_per_bbl"]
    assert metric["latest_value"] == 82.5
    assert metric["unit"] == "USD/bbl"
    assert metric["change_pct_1d"] == 0.5
    assert len(metric["points"]) >= 1


def test_get_market_history_delegates_service_call(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, mock_db: MagicMock
):
    fake = _make_history_response()
    calls = []
    def spy(db):
        calls.append(db)
        return fake

    monkeypatch.setattr("app.api.routes.market.build_market_history_response", spy)
    client.get("/v1/market/history")
    assert len(calls) == 1
    assert calls[0] is mock_db


# ── POST /market/refresh — auth & response shape ────────────────────────────


def test_post_market_refresh_rejects_missing_token(client: TestClient):
    response = client.post("/v1/market/refresh")
    assert response.status_code == 401


def test_post_market_refresh_rejects_invalid_token(client: TestClient):
    response = client.post(
        "/v1/market/refresh", headers={"x-admin-token": "wrong-token"}
    )
    assert response.status_code == 401


def test_post_market_refresh_returns_200_with_valid_token(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, mock_db: MagicMock
):
    now = utcnow()
    monkeypatch.setattr(
        "app.api.routes.market.refresh_market_snapshot_set",
        lambda db: (now, "ok"),
    )
    mock_db.scalar.return_value = 7

    response = client.post(
        "/v1/market/refresh",
        headers={"x-admin-token": "test-admin-token-999"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["accepted"] is True
    assert payload["source_status"] == "ok"
    assert payload["persisted_metric_count"] == 7
    assert payload["ingest"] == "live-refresh"


def test_post_market_refresh_skipped_lock_sets_ingest(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, mock_db: MagicMock
):
    now = utcnow()
    monkeypatch.setattr(
        "app.api.routes.market.refresh_market_snapshot_set",
        lambda db: (now, "skipped-lock"),
    )
    mock_db.scalar.return_value = 0

    response = client.post(
        "/v1/market/refresh",
        headers={"x-admin-token": "test-admin-token-999"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["accepted"] is True
    assert payload["source_status"] == "skipped-lock"
    assert payload["ingest"] == "skipped-lock"
    assert payload["persisted_metric_count"] == 0


# ── POST /market/history/backfill — auth & response shape ────────────────────


def test_post_market_backfill_rejects_missing_token(client: TestClient):
    response = client.post("/v1/market/history/backfill")
    assert response.status_code == 401


def test_post_market_backfill_rejects_invalid_token(client: TestClient):
    response = client.post(
        "/v1/market/history/backfill",
        headers={"x-admin-token": "bogus-token"},
    )
    assert response.status_code == 401


def test_post_market_backfill_returns_200_with_valid_token(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
):
    fake_result = {
        "inserted_metric_count": 42,
        "days_requested": 45,
        "sources": ["Yahoo Finance BZ=F", "FRED DJFUELUSGULF", "Yahoo Finance CO2.L"],
    }
    monkeypatch.setattr(
        "app.api.routes.market.backfill_market_history_from_public_sources",
        lambda db, days=45: fake_result,
    )

    response = client.post(
        "/v1/market/history/backfill",
        headers={"x-admin-token": "test-admin-token-999"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["accepted"] is True
    assert payload["inserted_metric_count"] == 42
    assert payload["days_requested"] == 45
    assert len(payload["sources"]) == 3
    assert "Backfilled 42" in payload["message"]


# ── Router metadata ──────────────────────────────────────────────────────────


def test_router_routes_are_registered():
    """Verify the 4 expected market routes exist on the router."""
    paths = {r.path for r in api_router.routes}
    assert "/market/snapshot" in paths
    assert "/market/history" in paths
    assert "/market/refresh" in paths
    assert "/market/history/backfill" in paths


def test_router_routes_have_correct_methods():
    """GET for read endpoints, POST for write (admin) endpoints."""
    for route in api_router.routes:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", set())
        if "snapshot" in path or path == "/market/history":
            assert methods == {"GET"}, f"{path} should be GET, got {methods}"
        elif "backfill" in path or "refresh" in path:
            assert methods == {"POST"}, f"{path} should be POST, got {methods}"
