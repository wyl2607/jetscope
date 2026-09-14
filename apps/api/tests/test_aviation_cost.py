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
