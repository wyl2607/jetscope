import math

import pytest

from app.services.analysis.breakeven import (
    _status_for_spread,
    compute_breakeven_oil_price,
    compute_tipping_point,
)
from app.schemas.analysis import TippingPointAssessment


@pytest.mark.parametrize(
    "spread_pct, expected",
    [
        (26.0, "uneconomic"),
        (25.0, "inflection"),
        (5.0001, "inflection"),
        (5.0, "marginal_switch"),
        (-10.0, "marginal_switch"),
        (-10.0001, "dominant"),
    ],
)
def test_status_for_spread_thresholds_and_boundaries(spread_pct, expected):
    assert _status_for_spread(spread_pct) == expected


def test_compute_tipping_point_returns_assessment_and_consistent_spread_status():
    result = compute_tipping_point(
        fossil_jet_usd_per_l=0.75,
        carbon_price_eur_per_t=90.0,
        subsidy_usd_per_l=0.20,
        blend_rate_pct=35.0,
        pathway_key="hefa",
    )

    assert isinstance(result, TippingPointAssessment)

    expected_spread_pct = (result.net_cost_spread_usd_per_l / result.fossil_jet_usd_per_l) * 100.0
    assert math.isclose(result.spread_pct, expected_spread_pct, rel_tol=1e-12, abs_tol=1e-12)
    assert result.status == _status_for_spread(result.spread_pct)


def test_compute_tipping_point_high_carbon_and_full_blend_lowers_net_saf_cost():
    no_support = compute_tipping_point(
        fossil_jet_usd_per_l=0.75,
        carbon_price_eur_per_t=0.0,
        subsidy_usd_per_l=0.0,
        blend_rate_pct=0.0,
        pathway_key="hefa",
    )

    high_support = compute_tipping_point(
        fossil_jet_usd_per_l=0.75,
        carbon_price_eur_per_t=500.0,
        subsidy_usd_per_l=1.0,
        blend_rate_pct=100.0,
        pathway_key="hefa",
    )

    assert high_support.net_saf_cost_usd_per_l < no_support.net_saf_cost_usd_per_l


def test_compute_breakeven_oil_price_rejects_non_positive_slope():
    with pytest.raises(ValueError, match="jet_proxy_slope must be > 0"):
        compute_breakeven_oil_price(
            saf_effective_usd_per_l=1.5,
            jet_proxy_slope=0.0,
            jet_proxy_intercept=0.3,
        )

    with pytest.raises(ValueError, match="jet_proxy_slope must be > 0"):
        compute_breakeven_oil_price(
            saf_effective_usd_per_l=1.5,
            jet_proxy_slope=-0.25,
            jet_proxy_intercept=0.3,
        )


@pytest.mark.parametrize(
    "saf, slope, intercept, expected",
    [
        (2.0, 0.5, 1.0, 2.0),
        (1.0, 0.5, 2.0, 0.0),
        (1.25, 0.4, 2.0, 0.0),
    ],
)
def test_compute_breakeven_oil_price_formula_and_floor(saf, slope, intercept, expected):
    result = compute_breakeven_oil_price(
        saf_effective_usd_per_l=saf,
        jet_proxy_slope=slope,
        jet_proxy_intercept=intercept,
    )

    assert math.isclose(result, expected, rel_tol=1e-12, abs_tol=1e-12)
    assert result >= 0.0
