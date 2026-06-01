import math

import pytest

from app.services.analysis.pathway_costs import (
    EUR_TO_USD,
    FOSSIL_JET_EMISSIONS_KG_PER_L,
    PATHWAY_COSTS,
    carbon_credit_usd_per_l,
    effective_saf_cost,
    get_pathway_cost,
    list_pathway_costs,
)


def test_get_pathway_cost_returns_band_for_valid_key() -> None:
    result = get_pathway_cost("hefa")

    assert result == PATHWAY_COSTS["hefa"]
    assert result.pathway_key == "hefa"


def test_get_pathway_cost_raises_keyerror_for_unknown_key() -> None:
    with pytest.raises(KeyError):
        get_pathway_cost("unknown_pathway")


def test_list_pathway_costs_non_empty_and_matches_mapping_values() -> None:
    costs = list_pathway_costs()

    assert costs
    assert costs == list(PATHWAY_COSTS.values())


def test_carbon_credit_is_zero_when_carbon_price_is_zero() -> None:
    assert carbon_credit_usd_per_l(0.0, 70.0) == 0.0


def test_carbon_credit_scales_linearly_with_carbon_price() -> None:
    low = carbon_credit_usd_per_l(50.0, 70.0)
    high = carbon_credit_usd_per_l(100.0, 70.0)

    assert math.isclose(high, low * 2.0, rel_tol=1e-12, abs_tol=1e-12)


def test_carbon_credit_matches_hand_computed_value() -> None:
    # 100 EUR/t with 80% reduction: USD/t * avoided t/L.
    expected = (100.0 * EUR_TO_USD) * ((FOSSIL_JET_EMISSIONS_KG_PER_L / 1000.0) * 0.8)

    result = carbon_credit_usd_per_l(100.0, 80.0)

    assert math.isclose(result, expected, rel_tol=1e-12, abs_tol=1e-12)


def test_effective_saf_cost_decreases_with_higher_subsidy_and_carbon_support() -> None:
    base = effective_saf_cost("hefa")

    more_subsidy = effective_saf_cost(
        "hefa",
        subsidy_usd_per_l=0.25,
    )

    more_carbon_support = effective_saf_cost(
        "hefa",
        carbon_price_eur_per_t=200.0,
    )

    combined_support = effective_saf_cost(
        "hefa",
        carbon_price_eur_per_t=200.0,
        subsidy_usd_per_l=0.25,
    )

    assert more_subsidy < base
    assert more_carbon_support < base
    assert combined_support < more_subsidy
    assert combined_support < more_carbon_support
