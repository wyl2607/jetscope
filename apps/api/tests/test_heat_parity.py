import pytest

from app.services.analysis.heat_costs import (
    DEFAULT_CARBON_PRICE_EUR_PER_T,
    DEFAULT_ELEC_PRICE_EUR_PER_MWH_EL,
    DEFAULT_GAS_PRICE_EUR_PER_MWH_TH,
    GAS_BOILER,
    gas_heat_cost,
    hp_heat_cost,
)
from app.services.analysis.heat_parity import (
    compute_heat_parity_rows,
    heat_carbon_price_sweep,
    heat_parity_signal,
)


def test_heat_cost_formulas_use_useful_heat_units() -> None:
    assert hp_heat_cost(cop=3.0, elec_price_eur_per_mwh_el=300.0) == pytest.approx(100.0)
    assert gas_heat_cost(
        gas_price_eur_per_mwh_th=75.0,
        carbon_price_eur_per_t=45.0,
        boiler=GAS_BOILER,
    ) == pytest.approx(75.0 / 0.92 + 45.0 * 0.20 / 0.92)


def test_default_breakeven_calibration_matches_heat_pump_baselines() -> None:
    rows = compute_heat_parity_rows(
        carbon_price_eur_per_t=DEFAULT_CARBON_PRICE_EUR_PER_T,
        elec_price_eur_per_mwh_el=DEFAULT_ELEC_PRICE_EUR_PER_MWH_EL,
        gas_price_eur_per_mwh_th=DEFAULT_GAS_PRICE_EUR_PER_MWH_TH,
    )
    by_key = {row.tech_key: row for row in rows}

    assert by_key["ground_source"].breakeven_carbon_price_eur_per_t == pytest.approx(0.0)
    assert by_key["ground_source"].status == "dominant"
    assert by_key["air_source"].breakeven_carbon_price_eur_per_t == pytest.approx(85.0)
    assert by_key["air_source"].breakeven_carbon_price_eur_per_t > DEFAULT_CARBON_PRICE_EUR_PER_T


def test_default_signal_is_clear_leader_when_ground_source_dominates() -> None:
    rows = compute_heat_parity_rows(
        carbon_price_eur_per_t=DEFAULT_CARBON_PRICE_EUR_PER_T,
        elec_price_eur_per_mwh_el=DEFAULT_ELEC_PRICE_EUR_PER_MWH_EL,
        gas_price_eur_per_mwh_th=DEFAULT_GAS_PRICE_EUR_PER_MWH_TH,
    )
    assert heat_parity_signal(rows) == "clear_leader"


def test_heat_carbon_sweep_is_monotonic_in_gas_heat_cost() -> None:
    sweep = heat_carbon_price_sweep(
        elec_price_eur_per_mwh_el=300.0,
        gas_price_eur_per_mwh_th=75.0,
        carbon_min=0.0,
        carbon_max=150.0,
        step=15.0,
    )
    costs = [point.gas_heat_cost_eur_per_mwh for point in sweep]
    air_gaps = [
        next(entry for entry in point.techs if entry.tech_key == "air_source").gap_vs_gas_eur_per_mwh
        for point in sweep
    ]

    assert len(sweep) == 11
    assert costs == sorted(costs)
    assert air_gaps == sorted(air_gaps, reverse=True)


def test_heat_carbon_sweep_rejects_non_positive_step() -> None:
    with pytest.raises(ValueError, match="step must be > 0"):
        heat_carbon_price_sweep(
            elec_price_eur_per_mwh_el=300.0,
            gas_price_eur_per_mwh_th=75.0,
            carbon_min=0.0,
            carbon_max=150.0,
            step=0.0,
        )
