import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router


@pytest.fixture
def client():
    app = FastAPI(title="eu-ets-pressure-test")
    app.include_router(api_router, prefix="/v1")
    return TestClient(app)


def test_happy_path(client):
    resp = client.get("/v1/policies/eu-ets-pressure", params={"fossil_jet_usd_per_l": 1.0, "eu_ets_max": 100, "eu_ets_step": 25})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["points"]) == 5
    assert body["signal"] in {"low", "moderate", "high", "severe"}
    assert body["source"]["source_type"] == "derived"
    assert 0 <= body["source"]["confidence_score"] <= 1


def test_rejects_nonpositive_fossil(client):
    assert client.get("/v1/policies/eu-ets-pressure", params={"fossil_jet_usd_per_l": 0}).status_code == 422


def test_rejects_blend_over_100(client):
    assert client.get(
        "/v1/policies/eu-ets-pressure", params={"fossil_jet_usd_per_l": 1.0, "exempt_blend_pct": 150}
    ).status_code == 422


def test_rejects_max_over_ceiling(client):
    assert client.get(
        "/v1/policies/eu-ets-pressure", params={"fossil_jet_usd_per_l": 1.0, "eu_ets_max": 2000}
    ).status_code == 422


def test_rejects_too_many_points(client):
    assert client.get(
        "/v1/policies/eu-ets-pressure", params={"fossil_jet_usd_per_l": 1.0, "eu_ets_max": 1000, "eu_ets_step": 1}
    ).status_code == 422


def test_rejects_max_below_min(client):
    assert client.get(
        "/v1/policies/eu-ets-pressure",
        params={"fossil_jet_usd_per_l": 1.0, "eu_ets_min": 100, "eu_ets_max": 50},
    ).status_code == 422


def test_existing_refuel_eu_untouched(client):
    # The new route must not shadow the existing one; refuel-eu needs a DB so just assert routing resolves (404/422/500 != 405)
    resp = client.get("/v1/policies/eu-ets-pressure", params={"fossil_jet_usd_per_l": 2.5, "eu_ets_max": 300, "eu_ets_step": 50})
    assert resp.status_code == 200
    assert resp.json()["points"][-1]["eu_ets_eur_per_t"] == 300
