import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router
from app.services.analysis.transition_summary import (
    compute_transition_summary,
    grid_breakeven_carbon_price,
)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI(title="transition-summary-test")
    app.include_router(api_router, prefix="/v1")
    return TestClient(app)


def test_grid_breakeven_clamped_for_cheap_solar() -> None:
    # Solar mid LCOE 55 is below the zero-carbon gas marginal cost → breakeven clamps to 0.
    assert grid_breakeven_carbon_price(55.0) == pytest.approx(0.0)
    # Offshore-style high LCOE needs a meaningfully positive carbon price.
    assert grid_breakeven_carbon_price(80.0) > 40.0


def test_summary_covers_grid_and_heat_domains() -> None:
    domains = compute_transition_summary()
    keys = {d.domain_key for d in domains}
    assert keys == {"grid", "heat"}
    for domain in domains:
        assert domain.techs
        for tech in domain.techs:
            assert tech.breakeven_carbon_price_eur_per_t >= 0


def test_transition_route_shape(client: TestClient) -> None:
    response = client.get("/v1/analysis/transition-summary")
    assert response.status_code == 200
    body = response.json()
    grid = next(d for d in body["domains"] if d["domain_key"] == "grid")
    heat = next(d for d in body["domains"] if d["domain_key"] == "heat")
    assert grid["carbon_driver"] == "EU ETS"
    assert heat["carbon_driver"] == "EU ETS2"
    air = next(t for t in heat["techs"] if t["tech_key"] == "air_source")
    assert air["competitive_at_reference"] is False
