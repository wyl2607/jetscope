from __future__ import annotations

import pytest

from app.schemas.analysis import TippingPointAssessment
from app.services.analysis.breakeven import (
    _status_for_spread,
    compute_breakeven_oil_price,
    compute_tipping_point,
)


class TestStatusForSpread:
    def test_uneconomic_when_above_25(self) -> None:
        assert _status_for_spread(30) == "uneconomic"
        assert _status_for_spread(25.0001) == "uneconomic"

    def test_inflection_when_above_5_and_below_equal_25(self) -> None:
        assert _status_for_spread(25) == "inflection"
        assert _status_for_spread(10) == "inflection"
        assert _status_for_spread(5.0001) == "inflection"

    def test_marginal_switch_when_above_equal_minus_10_and_below_equal_5(self) -> None:
        assert _status_for_spread(5) == "marginal_switch"
        assert _status_for_spread(0) == "marginal_switch"
        assert _status_for_spread(-10) == "marginal_switch"

    def test_dominant_when_below_minus_10(self) -> None:
        assert _status_for_spread(-10.0001) == "dominant"
        assert _status_for_spread(-50) == "dominant"
        assert _status_for_spread(-100) == "dominant"


class TestComputeBreakevenOilPrice:
    def test_positive_slope_returns_ratio(self) -> None:
        result = compute_breakeven_oil_price(
            saf_effective_usd_per_l=1.5,
            jet_proxy_slope=0.5,
            jet_proxy_intercept=0.2,
        )
        assert result == pytest.approx(2.6)

    def test_clamps_to_zero_when_negative(self) -> None:
        result = compute_breakeven_oil_price(
            saf_effective_usd_per_l=1.0,
            jet_proxy_slope=2.0,
            jet_proxy_intercept=5.0,
        )
        assert result == 0.0

    def test_raises_value_error_when_slope_is_zero(self) -> None:
        with pytest.raises(ValueError, match="jet_proxy_slope must be > 0"):
            compute_breakeven_oil_price(
                saf_effective_usd_per_l=1.5,
                jet_proxy_slope=0.0,
                jet_proxy_intercept=0.2,
            )

    def test_raises_value_error_when_slope_is_negative(self) -> None:
        with pytest.raises(ValueError, match="jet_proxy_slope must be > 0"):
            compute_breakeven_oil_price(
                saf_effective_usd_per_l=1.5,
                jet_proxy_slope=-1.0,
                jet_proxy_intercept=0.2,
            )


class TestComputeTippingPoint:
    def test_hefa_with_high_carbon_price_and_low_fossil_is_dominant(self) -> None:
        result = compute_tipping_point(
            fossil_jet_usd_per_l=1.40,
            carbon_price_eur_per_t=100.0,
            subsidy_usd_per_l=0.0,
            blend_rate_pct=100.0,
            pathway_key="hefa",
        )
        assert isinstance(result, TippingPointAssessment)
        assert result.net_cost_spread_usd_per_l < 0
        assert result.status == "dominant"

    def test_hefa_with_no_support_and_high_fossil_matches_expected_numeric(self) -> None:
        result = compute_tipping_point(
            fossil_jet_usd_per_l=2.0,
            carbon_price_eur_per_t=0.0,
            subsidy_usd_per_l=0.0,
            blend_rate_pct=100.0,
            pathway_key="hefa",
        )
        assert result.net_saf_cost_usd_per_l == pytest.approx(1.25, abs=1e-9)
        assert result.net_cost_spread_usd_per_l == pytest.approx(-0.75, abs=1e-9)
        assert result.spread_pct == pytest.approx(-37.5, abs=1e-9)
        assert result.status == "dominant"

    def test_hefa_high_fossil_price_becomes_uneconomic(self) -> None:
        result = compute_tipping_point(
            fossil_jet_usd_per_l=0.50,
            carbon_price_eur_per_t=0.0,
            subsidy_usd_per_l=0.0,
            blend_rate_pct=100.0,
            pathway_key="hefa",
        )
        assert result.spread_pct > 25
        assert result.status == "uneconomic"

    def test_atj_pathway_uses_different_midpoint(self) -> None:
        result = compute_tipping_point(
            fossil_jet_usd_per_l=1.40,
            carbon_price_eur_per_t=0.0,
            subsidy_usd_per_l=0.0,
            blend_rate_pct=100.0,
            pathway_key="atj",
        )
        assert result.pathway.pathway_key == "atj"
        assert result.net_saf_cost_usd_per_l == pytest.approx(1.5, abs=1e-9)

    def test_returns_expected_pydantic_model_fields(self) -> None:
        result = compute_tipping_point(
            fossil_jet_usd_per_l=1.40,
            carbon_price_eur_per_t=50.0,
            subsidy_usd_per_l=0.05,
            blend_rate_pct=50.0,
            pathway_key="hefa",
        )
        assert result.pathway.pathway_key == "hefa"
        assert result.blend_rate_pct == 50.0
        assert result.subsidy_usd_per_l == 0.05
        assert result.carbon_price_eur_per_t == 50.0
        assert result.carbon_credit_usd_per_l >= 0
        assert result.effective_support_usd_per_l >= 0
