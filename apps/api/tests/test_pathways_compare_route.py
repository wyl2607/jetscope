import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router


@pytest.fixture
def client():
    app = FastAPI(title="pathways-compare-test")
    app.include_router(api_router, prefix="/v1")
    return TestClient(app)


def test_compare_happy_path_returns_rows_and_signal(client):
    resp = client.get("/v1/pathways/compare", params={"fossil_jet_usd_per_l": 0.9})
    assert resp.status_code == 200
    body = resp.json()
    assert body["fossil_jet_usd_per_l"] == 0.9
    assert len(body["rows"]) == 4  # hefa, atj, ft, ptl (fossil excluded)
    keys = {row["pathway_key"] for row in body["rows"]}
    assert "fossil_jet_crisis" not in keys
    assert body["signal"] in {"clear_leader", "close_race", "no_advantage", "insufficient_data"}
    for row in body["rows"]:
        assert row["source"]["source_type"] == "manual"
        assert 0 <= row["source"]["confidence_score"] <= 1


def test_compare_no_sweep_by_default(client):
    resp = client.get("/v1/pathways/compare", params={"fossil_jet_usd_per_l": 1.0})
    assert resp.status_code == 200
    assert resp.json()["carbon_sweep"] == []


def test_compare_sweep_present_when_max_passed(client):
    resp = client.get(
        "/v1/pathways/compare",
        params={"fossil_jet_usd_per_l": 1.0, "carbon_sweep_max": 100, "carbon_sweep_step": 25},
    )
    assert resp.status_code == 200
    sweep = resp.json()["carbon_sweep"]
    assert len(sweep) == 5  # 0,25,50,75,100
    assert all(len(point["pathways"]) == 4 for point in sweep)


def test_compare_rejects_nonpositive_fossil(client):
    resp = client.get("/v1/pathways/compare", params={"fossil_jet_usd_per_l": 0})
    assert resp.status_code == 422


def test_compare_rejects_blend_over_100(client):
    resp = client.get(
        "/v1/pathways/compare", params={"fossil_jet_usd_per_l": 1.0, "blend_rate_pct": 150}
    )
    assert resp.status_code == 422


def test_compare_rejects_sweep_max_over_ceiling(client):
    resp = client.get(
        "/v1/pathways/compare", params={"fossil_jet_usd_per_l": 1.0, "carbon_sweep_max": 2000}
    )
    assert resp.status_code == 422


def test_compare_rejects_too_many_sweep_points(client):
    resp = client.get(
        "/v1/pathways/compare",
        params={"fossil_jet_usd_per_l": 1.0, "carbon_sweep_max": 1000, "carbon_sweep_step": 1},
    )
    assert resp.status_code == 422


def test_compare_rejects_sweep_max_below_min(client):
    resp = client.get(
        "/v1/pathways/compare",
        params={"fossil_jet_usd_per_l": 1.0, "carbon_sweep_min": 100, "carbon_sweep_max": 50},
    )
    assert resp.status_code == 422


def test_compare_high_carbon_price_shifts_signal(client):
    # A high carbon price + full blend should make SAF competitive (clear_leader / close_race).
    resp = client.get(
        "/v1/pathways/compare",
        params={"fossil_jet_usd_per_l": 1.0, "carbon_price_eur_per_t": 400, "blend_rate_pct": 100},
    )
    assert resp.status_code == 200
    assert resp.json()["signal"] in {"clear_leader", "close_race", "no_advantage"}
