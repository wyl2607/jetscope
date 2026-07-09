"""Auth contract: SQLite legacy write routes reject a missing admin token.

The three legacy routers are mounted directly here (they are gated behind
``settings.enable_sqlite_routes`` in the real app), and ``get_sqlite_db`` is
overridden to fail loudly if it ever resolves. Because ``_auth`` is declared
before the DB dependency on every write endpoint, a missing or invalid token
must be rejected before any DB session is opened.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import sqlite_alerts, sqlite_markets, sqlite_scenarios
from app.core.config import settings
from app.db.sqlite import get_sqlite_db


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(settings, "admin_token", "test-admin-token")

    app = FastAPI(title="sqlite-legacy-write-auth-contract-test")
    app.include_router(sqlite_alerts.router, prefix="/v1")
    app.include_router(sqlite_markets.router, prefix="/v1")
    app.include_router(sqlite_scenarios.router, prefix="/v1")

    def _db_must_not_resolve():
        raise AssertionError("get_sqlite_db should not resolve before admin-token auth")
        yield

    app.dependency_overrides[get_sqlite_db] = _db_must_not_resolve
    return TestClient(app)


ALERT_PAYLOAD = {
    "market_type": "ARA",
    "threshold_type": "above",
    "threshold_value": 640.0,
}

PRICE_PAYLOAD = {
    "timestamp": "2026-01-01T00:00:00Z",
    "market_type": "ARA",
    "price": 612.5,
    "unit": "USD/bbl",
    "source": "unit-test",
}

SCENARIO_PAYLOAD = {
    "scenario_name": "Demand shock",
    "description": "Higher demand scenario",
    "parameters": {"reserve_weeks": 6},
}


@pytest.mark.parametrize(
    ("method", "path", "json_payload"),
    [
        ("post", "/v1/sqlite/market-alerts", ALERT_PAYLOAD),
        ("put", "/v1/sqlite/market-alerts/missing", {"status": "inactive"}),
        ("delete", "/v1/sqlite/market-alerts/missing", None),
        ("put", "/v1/sqlite/market-alerts/missing/trigger", None),
        ("post", "/v1/sqlite/market-prices", PRICE_PAYLOAD),
        ("put", "/v1/sqlite/market-prices/missing", {"price": 620.0}),
        ("delete", "/v1/sqlite/market-prices/missing", None),
        ("post", "/v1/sqlite/user-scenarios?user_id=demo", SCENARIO_PAYLOAD),
        ("put", "/v1/sqlite/user-scenarios/missing", {"scenario_name": "x"}),
        ("delete", "/v1/sqlite/user-scenarios/missing", None),
        ("delete", "/v1/sqlite/user-scenarios?user_id=demo", None),
    ],
)
def test_sqlite_legacy_write_routes_reject_missing_admin_token_before_db(
    client: TestClient, method: str, path: str, json_payload: object | None
) -> None:
    response = client.request(method, path, json=json_payload)

    assert response.status_code in {401, 403}
