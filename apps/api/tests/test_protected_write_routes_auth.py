import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router
from app.core.config import settings
from app.db.session import get_db


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(settings, "admin_token", "test-admin-token")

    app = FastAPI(title="protected-write-auth-contract-test")
    app.include_router(api_router, prefix="/v1")

    def _db_must_not_resolve():
        raise AssertionError("get_db should not resolve before admin-token auth")
        yield

    app.dependency_overrides[get_db] = _db_must_not_resolve
    return TestClient(app)


PATHWAY_PAYLOAD = [
    {
        "pathway_id": "auth-contract-pathway",
        "name": "Auth Contract Pathway",
        "pathway": "Test feedstock -> Jet",
        "base_cost_usd_per_l": 1.23,
        "co2_savings_kg_per_l": 0.45,
        "category": "saf",
    }
]

POLICY_PAYLOAD = [
    {
        "year": 2030,
        "saf_share_pct": 6,
        "synthetic_share_pct": 1.2,
        "label": "Auth contract target",
    }
]

PREFERENCES_PAYLOAD = {
    "preferences": {
        "schema_version": 1,
        "crudeSource": "manual",
        "carbonSource": "manual",
        "benchmarkMode": "crude-proxy",
    },
    "route_edits": {},
}

SCENARIO_PAYLOAD = {
    "name": "Auth contract scenario",
    "preferences": {
        "schema_version": 1,
        "crudeSource": "manual",
        "carbonSource": "manual",
        "benchmarkMode": "crude-proxy",
    },
    "route_edits": {},
}


@pytest.mark.parametrize(
    ("method", "path", "json_payload"),
    [
        ("post", "/v1/market/history/backfill", None),
        ("post", "/v1/market/refresh", None),
        ("post", "/v1/analysis/grid-parity/history/seed", None),
        ("put", "/v1/pathways", PATHWAY_PAYLOAD),
        ("put", "/v1/policies/refuel-eu", POLICY_PAYLOAD),
        ("post", "/v1/research/refresh", None),
        ("put", "/v1/workspaces/demo/preferences", PREFERENCES_PAYLOAD),
        ("delete", "/v1/workspaces/demo/preferences", None),
        ("post", "/v1/workspaces/demo/scenarios", SCENARIO_PAYLOAD),
        ("put", "/v1/workspaces/demo/scenarios/missing", SCENARIO_PAYLOAD),
        ("delete", "/v1/workspaces/demo/scenarios/missing", None),
    ],
)
def test_protected_write_routes_reject_missing_admin_token_before_db(
    client: TestClient, method: str, path: str, json_payload: object | None
) -> None:
    response = client.request(method, path, json=json_payload)

    assert response.status_code in {401, 403}
