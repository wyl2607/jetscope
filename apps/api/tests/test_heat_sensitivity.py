import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router
from app.services.analysis.heat_costs import DEFAULT_GAS_PRICE_EUR_PER_MWH_TH
from app.services.analysis.heat_sensitivity import (
    breakeven_carbon_price_eur_per_t,
    compute_heat_sensitivity,
)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI(title="heat-sensitivity-test")
    app.include_router(api_router, prefix="/v1")
    return TestClient(app)


def test_breakeven_calibration_air_source_baseline() -> None:
    # elec=300, cop=3.0 -> hp_cost=100; gas=75, eta=0.92, emission=0.20
    hp_cost = 300.0 / 3.0
    breakeven = breakeven_carbon_price_eur_per_t(
        hp_cost=hp_cost, gas_price_eur_per_mwh_th=DEFAULT_GAS_PRICE_EUR_PER_MWH_TH
    )
    assert breakeven == pytest.approx(85.0, abs=0.5)


def test_breakeven_clamped_to_zero_for_ground_source() -> None:
    hp_cost = 300.0 / 4.0  # 75
    breakeven = breakeven_carbon_price_eur_per_t(
        hp_cost=hp_cost, gas_price_eur_per_mwh_th=DEFAULT_GAS_PRICE_EUR_PER_MWH_TH
    )
    assert breakeven == pytest.approx(0.0)


def test_breakeven_falls_as_cop_rises() -> None:
    points = compute_heat_sensitivity(gas_price_eur_per_mwh_th=DEFAULT_GAS_PRICE_EUR_PER_MWH_TH)
    same_elec = sorted(
        (p for p in points if p.elec_price_eur_per_mwh_el == 300.0),
        key=lambda p: p.cop,
    )
    breakevens = [p.breakeven_carbon_price_eur_per_t for p in same_elec]
    assert breakevens == sorted(breakevens, reverse=True)
    assert breakevens[0] > breakevens[-1]


def test_sensitivity_route_shape(client: TestClient) -> None:
    response = client.get("/v1/analysis/heat-parity/sensitivity")
    assert response.status_code == 200
    body = response.json()
    assert body["cops"] == [2.5, 3.0, 3.5, 4.0]
    assert body["elec_prices"] == [240.0, 300.0, 360.0]
    assert len(body["cells"]) == 12
    assert all(cell["breakeven_carbon_price_eur_per_t"] >= 0 for cell in body["cells"])
