from __future__ import annotations

import pytest

from app.services.aviation_cost import (
    AviationCostError,
    compute_market_linked_flight_cost,
    kg_to_metric_tons,
    usd_per_bbl_to_usd_per_l,
    usd_per_gal_to_usd_per_l,
    usd_per_l_to_usd_per_t,
)


def test_unit_conversions_are_directional_and_positive() -> None:
    assert usd_per_bbl_to_usd_per_l(158.987294928) == pytest.approx(1.0, abs=1e-6)
    assert usd_per_gal_to_usd_per_l(3.78541) == pytest.approx(1.0, abs=1e-6)
    assert usd_per_l_to_usd_per_t(0.8) == pytest.approx(1000.0, abs=1e-6)
    assert kg_to_metric_tons(25000) == 25.0


def test_flight_cost_moves_with_jet_price_and_fx() -> None:
    base = compute_market_linked_flight_cost(
        fossil_jet_usd_per_l=0.913,
        usd_per_eur=1.1592,
        fuel_burn_t=20.0,
        passengers=180,
        eua_eur_per_t=80.38,
        airport_quote_available=False,
        quality="derived",
    )
    higher_jet = compute_market_linked_flight_cost(
        fossil_jet_usd_per_l=1.000,
        usd_per_eur=1.1592,
        fuel_burn_t=20.0,
        passengers=180,
        eua_eur_per_t=80.38,
        quality="derived",
    )
    stronger_usd = compute_market_linked_flight_cost(
        fossil_jet_usd_per_l=0.913,
        usd_per_eur=1.20,
        fuel_burn_t=20.0,
        passengers=180,
        eua_eur_per_t=80.38,
        quality="derived",
    )

    assert base["not_an_airline_invoice"] is True
    assert base["label"] == "market_linked_cost_estimate"
    assert higher_jet["fuel_and_compliance_eur"] > base["fuel_and_compliance_eur"]
    assert stronger_usd["fuel_cost_eur"] < base["fuel_cost_eur"]
    assert base["per_passenger_eur"] == pytest.approx(
        base["fuel_and_compliance_eur"] / 180, abs=0.011
    )
    assert base["carbon_cost_eur"] is not None
    assert base["airport_quote_available"] is False


def test_zero_passengers_is_not_computable() -> None:
    with pytest.raises(AviationCostError):
        compute_market_linked_flight_cost(
            fossil_jet_usd_per_l=0.913,
            usd_per_eur=1.1592,
            fuel_burn_t=20.0,
            passengers=0,
        )


def test_saf_and_carbon_are_not_double_counted_as_invoice() -> None:
    result = compute_market_linked_flight_cost(
        fossil_jet_usd_per_l=0.80,
        usd_per_eur=1.10,
        saf_usd_per_l=1.60,
        blend_share=0.02,
        fuel_burn_t=10.0,
        passengers=100,
        eua_eur_per_t=80.0,
        quality="derived",
    )
    assert result["fuel_cost_eur"] + result["carbon_cost_eur"] == pytest.approx(
        result["fuel_and_compliance_eur"]
    )
    assert "not total operating cost" in " ".join(result["limitations"])


def _known_repro_inputs(**overrides):
    payload = {
        "fossil_jet_usd_per_l": 1.0,
        "usd_per_eur": 1.25,
        "fuel_burn_t": 10.0,
        "passengers": 100,
        "eua_eur_per_t": 80.0,
        "blend_share": 0.0,
        "quality": "derived",
    }
    payload.update(overrides)
    return payload


def test_zero_saf_repro_total_is_12528() -> None:
    result = compute_market_linked_flight_cost(**_known_repro_inputs())
    assert result["fuel_cost_eur"] == pytest.approx(10000.0)
    assert result["carbon_cost_eur"] == pytest.approx(2528.0)
    assert result["fuel_and_compliance_eur"] == pytest.approx(12528.0)


def test_nonzero_saf_without_price_is_not_computable() -> None:
    result = compute_market_linked_flight_cost(**_known_repro_inputs(blend_share=1.0))
    assert result["computable"] is False
    assert "saf_usd_per_l" in result["missing_inputs"]
    assert result["fuel_and_compliance_eur"] is None
    assert result["fuel_cost_eur"] is None


def test_missing_eua_keeps_fuel_subtotal_and_unknown_compliance() -> None:
    result = compute_market_linked_flight_cost(**_known_repro_inputs(eua_eur_per_t=None, ets_applicable=True))
    assert result["computable"] is False
    assert result["fuel_cost_eur"] == pytest.approx(10000.0)
    assert result["carbon_cost_eur"] is None
    assert result["fuel_and_compliance_eur"] is None
    assert "eua_eur_per_t" in result["missing_inputs"]


def test_ets_not_applicable_is_known_zero_not_missing_carbon() -> None:
    result = compute_market_linked_flight_cost(
        **_known_repro_inputs(eua_eur_per_t=None, ets_applicable=False)
    )
    assert result["carbon_cost_eur"] == 0.0
    assert result["fuel_and_compliance_eur"] == pytest.approx(10000.0)
    assert "eua_eur_per_t" not in result["missing_inputs"]


def test_saf_percent_does_not_auto_zero_carbon() -> None:
    result = compute_market_linked_flight_cost(
        **_known_repro_inputs(blend_share=1.0, saf_usd_per_l=2.0)
    )
    assert result["carbon_cost_eur"] == pytest.approx(2528.0)


def test_illegal_blend_and_non_finite_inputs_are_rejected() -> None:
    with pytest.raises(AviationCostError):
        compute_market_linked_flight_cost(**_known_repro_inputs(blend_share=2.0))
    with pytest.raises(AviationCostError):
        compute_market_linked_flight_cost(**_known_repro_inputs(fuel_burn_t=float("nan")))
    with pytest.raises(AviationCostError):
        compute_market_linked_flight_cost(**_known_repro_inputs(usd_per_eur=float("inf")))
    with pytest.raises(AviationCostError):
        compute_market_linked_flight_cost(**_known_repro_inputs(passengers=1.5))


def test_private_energy_tax_assumption_converts_liters_to_tonnes() -> None:
    from app.services.aviation_cost import (
        PRIVATE_JET_ENERGY_TAX_EUR_PER_L_ASSUMPTION,
        energy_tax_eur_per_t_from_eur_per_l,
    )

    assert PRIVATE_JET_ENERGY_TAX_EUR_PER_L_ASSUMPTION == pytest.approx(0.6545)
    assert energy_tax_eur_per_t_from_eur_per_l(0.6545) == pytest.approx(818.125)
    result = compute_market_linked_flight_cost(
        **_known_repro_inputs(
            applicable_tax_eur_per_t=energy_tax_eur_per_t_from_eur_per_l(0.6545),
            eua_eur_per_t=None,
            ets_applicable=False,
        )
    )
    assert result["fuel_cost_eur"] == pytest.approx(10000.0 + 8181.25)


def test_cost_change_drivers_reconcile_to_total_delta() -> None:
    from app.services.aviation_cost import compute_cost_change

    baseline = _known_repro_inputs()
    current = _known_repro_inputs(
        fossil_jet_usd_per_l=1.10,
        usd_per_eur=1.20,
        eua_eur_per_t=90.0,
        airport_diff_eur_per_t=20.0,
    )
    delta = compute_cost_change(baseline=baseline, current=current)
    driver_sum = sum(
        value
        for key, value in delta["drivers_eur_per_flight"].items()
        if isinstance(value, (int, float))
    )
    assert delta["fuel_and_compliance_delta_eur"] == pytest.approx(driver_sum, abs=0.02)
    assert delta["same_fuel_burn_and_passengers"] is True
    assert "not total operating cost" in " ".join(delta["limitations"])


def _shared_cost_cases() -> dict:
    from pathlib import Path
    import json

    path = Path(__file__).resolve().parents[3] / "test" / "aviation-cost-shared.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _assert_drivers_conserve(delta: dict) -> None:
    driver_sum = sum(
        value
        for value in delta["drivers_eur_per_flight"].values()
        if isinstance(value, (int, float))
    )
    assert delta["fuel_and_compliance_delta_eur"] == pytest.approx(driver_sum, abs=0.02)
    assert "saf" in delta["drivers_eur_per_flight"]


def test_saf_blend_jet_move_drivers_conserve() -> None:
    from app.services.aviation_cost import compute_cost_change

    case = _shared_cost_cases()["jet_only_repro"]
    delta = compute_cost_change(baseline=case["baseline"], current=case["current"])
    assert delta["fuel_and_compliance_delta_eur"] == pytest.approx(1000.0, abs=0.02)
    _assert_drivers_conserve(delta)


def test_shared_saf_and_fx_change_drivers_conserve() -> None:
    from app.services.aviation_cost import compute_cost_change

    case = _shared_cost_cases()["saf_and_fx"]
    delta = compute_cost_change(baseline=case["baseline"], current=case["current"])
    _assert_drivers_conserve(delta)
    assert delta["drivers_eur_per_flight"]["fx"] != 0
    assert delta["drivers_eur_per_flight"]["saf"] != 0
