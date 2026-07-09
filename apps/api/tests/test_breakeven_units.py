import pytest

from app.services.analysis.breakeven import (
    _status_for_spread,
    compute_breakeven_oil_price,
    compute_tipping_point,
)
from app.services.analysis.pathway_costs import (
    EUR_TO_USD,
    FOSSIL_JET_EMISSIONS_KG_PER_L,
    get_pathway_cost,
)


def test_status_for_spread_boundaries() -> None:
    assert _status_for_spread(26.0) == "uneconomic"
    assert _status_for_spread(25.0) == "inflection"
    assert _status_for_spread(5.0) == "marginal_switch"
    assert _status_for_spread(-10.0) == "marginal_switch"
    assert _status_for_spread(-10.01) == "dominant"


def test_compute_tipping_point_matches_expected_calculation() -> None:
    fossil_jet_usd_per_l = 1.20
    carbon_price_eur_per_t = 90.0
    subsidy_usd_per_l = 0.10
    blend_rate_pct = 40.0

    assessment = compute_tipping_point(
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        subsidy_usd_per_l=subsidy_usd_per_l,
        blend_rate_pct=blend_rate_pct,
        pathway_key="hefa",
    )

    pathway = get_pathway_cost("hefa")
    expected_credit = (
        carbon_price_eur_per_t
        * EUR_TO_USD
        * (FOSSIL_JET_EMISSIONS_KG_PER_L / 1000.0)
        * (pathway.carbon_reduction_pct / 100.0)
    )
    expected_support = (subsidy_usd_per_l + expected_credit) * (blend_rate_pct / 100.0)
    expected_net_saf_cost = pathway.midpoint_usd_per_l - expected_support
    expected_spread = expected_net_saf_cost - fossil_jet_usd_per_l
    expected_spread_pct = (expected_spread / fossil_jet_usd_per_l) * 100.0

    assert assessment.pathway.pathway_key == "hefa"
    assert assessment.carbon_credit_usd_per_l == pytest.approx(expected_credit)
    assert assessment.effective_support_usd_per_l == pytest.approx(expected_support)
    assert assessment.net_saf_cost_usd_per_l == pytest.approx(expected_net_saf_cost)
    assert assessment.net_cost_spread_usd_per_l == pytest.approx(expected_spread)
    assert assessment.spread_pct == pytest.approx(expected_spread_pct)
    assert assessment.status == "marginal_switch"


def test_compute_breakeven_oil_price_formula_and_floor() -> None:
    assert compute_breakeven_oil_price(
        saf_effective_usd_per_l=1.25,
        jet_proxy_slope=0.01,
        jet_proxy_intercept=0.30,
    ) == pytest.approx(95.0)

    assert compute_breakeven_oil_price(
        saf_effective_usd_per_l=0.20,
        jet_proxy_slope=0.01,
        jet_proxy_intercept=0.30,
    ) == 0.0


def test_compute_breakeven_oil_price_rejects_non_positive_slope() -> None:
    with pytest.raises(ValueError, match="jet_proxy_slope must be > 0"):
        compute_breakeven_oil_price(
            saf_effective_usd_per_l=1.25,
            jet_proxy_slope=0.0,
            jet_proxy_intercept=0.30,
        )
