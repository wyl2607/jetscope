import pytest

from app.services.analysis.grid_costs import fossil_marginal_cost
from app.services.analysis.grid_parity import (
    compute_grid_parity_rows,
    grid_carbon_price_sweep,
    grid_parity_signal,
)


def test_fossil_marginal_cost_includes_carbon() -> None:
    # gas_ccgt: 30/0.55 + 4 + 65*0.35 = 54.545... + 4 + 22.75
    cost = fossil_marginal_cost(
        "gas_ccgt", fuel_cost_eur_per_mwh_th=30.0, carbon_price_eur_per_t=65.0
    )
    assert cost == pytest.approx(30.0 / 0.55 + 4.0 + 65.0 * 0.35)


def test_higher_carbon_price_widens_renewable_advantage() -> None:
    low = compute_grid_parity_rows(
        fossil_plant_key="gas_ccgt", fuel_cost_eur_per_mwh_th=30.0, carbon_price_eur_per_t=0.0
    )
    high = compute_grid_parity_rows(
        fossil_plant_key="gas_ccgt", fuel_cost_eur_per_mwh_th=30.0, carbon_price_eur_per_t=100.0
    )
    low_solar = next(r for r in low if r.tech_key == "solar_pv")
    high_solar = next(r for r in high if r.tech_key == "solar_pv")
    # A higher carbon price raises the fossil reference, so the gap becomes more negative.
    assert high_solar.gap_vs_fossil_eur_per_mwh < low_solar.gap_vs_fossil_eur_per_mwh
    assert high_solar.status == "dominant"


def test_signal_is_clear_leader_when_a_tech_dominates() -> None:
    rows = compute_grid_parity_rows(
        fossil_plant_key="gas_ccgt", fuel_cost_eur_per_mwh_th=30.0, carbon_price_eur_per_t=65.0
    )
    assert grid_parity_signal(rows) == "clear_leader"


def test_carbon_sweep_is_monotonic_in_fossil_cost() -> None:
    sweep = grid_carbon_price_sweep(
        fossil_plant_key="gas_ccgt",
        fuel_cost_eur_per_mwh_th=30.0,
        carbon_min=0.0,
        carbon_max=100.0,
        step=50.0,
    )
    costs = [point.fossil_marginal_cost_eur_per_mwh for point in sweep]
    assert costs == sorted(costs)
    assert len(sweep) == 3  # 0, 50, 100


def test_carbon_sweep_rejects_non_positive_step() -> None:
    with pytest.raises(ValueError, match="step must be > 0"):
        grid_carbon_price_sweep(
            fossil_plant_key="gas_ccgt",
            fuel_cost_eur_per_mwh_th=30.0,
            carbon_min=0.0,
            carbon_max=100.0,
            step=0.0,
        )
