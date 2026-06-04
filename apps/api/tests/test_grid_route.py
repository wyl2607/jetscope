import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router


@pytest.fixture
def client():
    app = FastAPI(title="grid-parity-test")
    app.include_router(api_router, prefix="/v1")
    return TestClient(app)


def test_grid_parity_happy_path(client):
    resp = client.get("/v1/analysis/grid-parity", params={"carbon_price_eur_per_t": 65})
    assert resp.status_code == 200
    body = resp.json()
    assert {row["tech_key"] for row in body["rows"]} == {
        "solar_pv",
        "onshore_wind",
        "offshore_wind",
    }
    assert body["fossil_reference"]["plant_key"] == "gas_ccgt"
    assert body["signal"] in {"clear_leader", "close_race", "no_advantage"}
    assert len(body["carbon_sweep"]) == 11  # 0..150 step 15


def test_grid_parity_unknown_reference_returns_404(client):
    resp = client.get(
        "/v1/analysis/grid-parity", params={"fossil_reference_key": "nuclear"}
    )
    assert resp.status_code == 404


def test_grid_parity_rejects_negative_carbon_price(client):
    resp = client.get("/v1/analysis/grid-parity", params={"carbon_price_eur_per_t": -1})
    assert resp.status_code == 422


def test_grid_parity_history_returns_series(client):
    resp = client.get("/v1/analysis/grid-parity/history")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["points"]) >= 5
    years = [p["year"] for p in body["points"]]
    assert years == sorted(years)
    assert "disclaimer" in body
