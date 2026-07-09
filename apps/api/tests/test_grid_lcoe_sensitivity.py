import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router
from app.services.analysis.grid_costs import (
    DEFAULT_COAL_FUEL_EUR_PER_MWH_TH,
    DEFAULT_GAS_FUEL_EUR_PER_MWH_TH,
)
from app.services.analysis.grid_lcoe_sensitivity import (
    LcoeSensitivityPoint,
    capital_recovery_factor,
    compute_lcoe_sensitivity,
    renewable_lcoe_eur_per_mwh,
)


def _point(
    points: list[LcoeSensitivityPoint], *, discount_rate: float, full_load_hours: int
) -> LcoeSensitivityPoint:
    return next(
        point
        for point in points
        if point.discount_rate == discount_rate and point.full_load_hours == full_load_hours
    )


@pytest.fixture
def client() -> TestClient:
    app = FastAPI(title="grid-lcoe-sensitivity-test")
    app.include_router(api_router, prefix="/v1")
    return TestClient(app)


def test_capital_recovery_factor_zero_rate_and_standard_rate() -> None:
    assert capital_recovery_factor(0.0, 30) == pytest.approx(1 / 30)
    assert capital_recovery_factor(0.05, 30) == pytest.approx(0.0651, abs=0.0001)


def test_solar_lcoe_matches_baseline_case() -> None:
    lcoe = renewable_lcoe_eur_per_mwh(
        capex_eur_per_kw=700.0,
        fixed_om_eur_per_kw_yr=12.0,
        discount_rate=0.05,
        lifetime_years=30,
        full_load_hours=1000,
    )

    assert lcoe == pytest.approx(57.5, abs=0.1)


def test_baseline_solar_breakeven_is_clamped_to_zero() -> None:
    points = compute_lcoe_sensitivity(
        tech_key="solar_pv",
        fossil_plant_key="gas_ccgt",
        fuel_cost_eur_per_mwh_th=DEFAULT_GAS_FUEL_EUR_PER_MWH_TH,
    )

    baseline = _point(points, discount_rate=0.05, full_load_hours=1000)
    assert baseline.breakeven_carbon_price_eur_per_t == pytest.approx(0.0)


def test_breakeven_carbon_price_rises_with_discount_rate() -> None:
    points = compute_lcoe_sensitivity(
        tech_key="solar_pv",
        fossil_plant_key="gas_ccgt",
        fuel_cost_eur_per_mwh_th=DEFAULT_GAS_FUEL_EUR_PER_MWH_TH,
    )

    same_flh = sorted(
        (point for point in points if point.full_load_hours == 1000),
        key=lambda point: point.discount_rate,
    )
    breakevens = [point.breakeven_carbon_price_eur_per_t for point in same_flh]
    assert breakevens == sorted(breakevens)
    assert breakevens[-1] > breakevens[0]


def test_hard_coal_lcoe_sensitivity_uses_coal_fuel_price(client: TestClient) -> None:
    gas_response = client.get(
        "/v1/analysis/grid-parity/lcoe-sensitivity",
        params={
            "tech_key": "solar_pv",
            "fossil_reference_key": "gas_ccgt",
            "gas_fuel_eur_per_mwh_th": DEFAULT_GAS_FUEL_EUR_PER_MWH_TH,
            "coal_fuel_eur_per_mwh_th": DEFAULT_COAL_FUEL_EUR_PER_MWH_TH,
        },
    )
    coal_response = client.get(
        "/v1/analysis/grid-parity/lcoe-sensitivity",
        params={
            "tech_key": "solar_pv",
            "fossil_reference_key": "hard_coal",
            "gas_fuel_eur_per_mwh_th": DEFAULT_GAS_FUEL_EUR_PER_MWH_TH,
            "coal_fuel_eur_per_mwh_th": DEFAULT_COAL_FUEL_EUR_PER_MWH_TH,
        },
    )

    assert gas_response.status_code == 200
    assert coal_response.status_code == 200

    gas_cell = next(
        cell
        for cell in gas_response.json()["cells"]
        if cell["discount_rate"] == 0.05 and cell["full_load_hours"] == 1000
    )
    coal_cell = next(
        cell
        for cell in coal_response.json()["cells"]
        if cell["discount_rate"] == 0.05 and cell["full_load_hours"] == 1000
    )

    assert gas_cell["breakeven_carbon_price_eur_per_t"] == pytest.approx(0.0)
    assert coal_cell["breakeven_carbon_price_eur_per_t"] == pytest.approx(23.9, abs=0.1)
    assert coal_cell["breakeven_carbon_price_eur_per_t"] != gas_cell[
        "breakeven_carbon_price_eur_per_t"
    ]
