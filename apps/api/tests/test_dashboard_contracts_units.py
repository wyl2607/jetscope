from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

from app.schemas.analysis import (
    AirlineDecisionAssessment,
    AirlineDecisionProbabilities,
    PathwayCostBand,
    TippingPointAssessment,
    TippingPointResponse,
)
from app.services.analysis import dashboard_contracts

FIXED_NOW = datetime(2026, 6, 4, 12, 0, 0, tzinfo=timezone.utc)

_SAMPLE_PATHWAY = PathwayCostBand(
    pathway_key="hefa",
    name="HEFA",
    min_usd_per_l=1.0,
    max_usd_per_l=1.5,
    midpoint_usd_per_l=1.25,
    carbon_reduction_pct=70.0,
    maturity_level="commercial",
)


# ---------------------------------------------------------------------------
# _effective_fossil_jet_usd_per_l
# ---------------------------------------------------------------------------

def test_effective_fossil_jet_zero_carbon_price() -> None:
    """No carbon price → effective == fossil price."""
    result = dashboard_contracts._effective_fossil_jet_usd_per_l(1.5, 0.0, 0.0)
    assert result == 1.5


def test_effective_fossil_jet_adds_carbon_cost() -> None:
    """carbon_cost = 100 × 1.08 × 2.5/1000 = 0.27; 1.5 + 0.27 = 1.77."""
    result = dashboard_contracts._effective_fossil_jet_usd_per_l(1.5, 100.0, 0.0)
    assert result == pytest.approx(1.77)


def test_effective_fossil_jet_blend_offsets_carbon() -> None:
    """50 % blend → half carbon cost: 1.5 + 0.27 × 0.5 = 1.635."""
    result = dashboard_contracts._effective_fossil_jet_usd_per_l(1.5, 100.0, 50.0)
    assert result == pytest.approx(1.635)


# ---------------------------------------------------------------------------
# _pathway_status
# ---------------------------------------------------------------------------

def test_pathway_status_competitive() -> None:
    assert dashboard_contracts._pathway_status(1.5, 1.0, 1.5) == "competitive"


def test_pathway_status_inflection_by_net_low() -> None:
    assert dashboard_contracts._pathway_status(1.5, 1.5, 2.0) == "inflection"


def test_pathway_status_inflection_within_15_pct() -> None:
    """(1.65 - 1.5) / 1.5 = 0.1 ≤ 0.15"""
    assert dashboard_contracts._pathway_status(1.5, 1.65, 2.0) == "inflection"


def test_pathway_status_premium() -> None:
    """(2.0 - 1.5) / 1.5 ≈ 0.333 > 0.15"""
    assert dashboard_contracts._pathway_status(1.5, 2.0, 2.5) == "premium"


# ---------------------------------------------------------------------------
# _pathway_row
# ---------------------------------------------------------------------------

def test_pathway_row_net_cost_and_spread() -> None:
    assessment = TippingPointAssessment(
        pathway=_SAMPLE_PATHWAY,
        fossil_jet_usd_per_l=1.5,
        carbon_price_eur_per_t=0.0,
        subsidy_usd_per_l=0.1,
        blend_rate_pct=100.0,
        carbon_credit_usd_per_l=0.0,
        effective_support_usd_per_l=0.1,
        net_saf_cost_usd_per_l=1.15,
        net_cost_spread_usd_per_l=-0.35,
        spread_pct=-23.33,
        status="dominant",
    )
    result = dashboard_contracts._pathway_row(assessment, effective_fossil_jet_usd_per_l=1.5)

    assert result.pathway_key == "hefa"
    assert result.display_name == "HEFA"
    # net_low = max(0.0001, 1.0 - 0.1) = 0.9
    # net_high = max(0.9, 1.5 - 0.1) = 1.4
    assert result.net_cost_low_usd_per_l == pytest.approx(0.9)
    assert result.net_cost_high_usd_per_l == pytest.approx(1.4)
    # spread_low = ((0.9 - 1.5) / 1.5) × 100 = -40.0
    # spread_high = ((1.4 - 1.5) / 1.5) × 100 ≈ -6.67
    assert result.spread_low_pct == pytest.approx(-40.0)
    assert result.spread_high_pct == pytest.approx(-6.67, abs=0.01)
    # net_high (1.4) <= effective (1.5) → competitive
    assert result.status == "competitive"


# ---------------------------------------------------------------------------
# _decision_signal
# ---------------------------------------------------------------------------

def test_decision_signal_switch_window() -> None:
    assessment = AirlineDecisionAssessment(
        pathway=_SAMPLE_PATHWAY,
        fossil_jet_usd_per_l=1.5,
        reserve_weeks=10.0,
        carbon_price_eur_per_t=100.0,
        probabilities=AirlineDecisionProbabilities(
            raise_fares=0.3,
            cut_capacity=0.2,
            buy_spot_saf=0.1,
            sign_long_term_offtake=0.6,
            ground_routes=0.05,
        ),
        dominant_response="sign_long_term_offtake",
        reserve_signal="normal",
    )
    assert dashboard_contracts._decision_signal(assessment) == "switch_window_opening"


def test_decision_signal_capacity_stress_critical_cut_capacity() -> None:
    assessment = AirlineDecisionAssessment(
        pathway=_SAMPLE_PATHWAY,
        fossil_jet_usd_per_l=1.5,
        reserve_weeks=1.0,
        carbon_price_eur_per_t=100.0,
        probabilities=AirlineDecisionProbabilities(
            raise_fares=0.2,
            cut_capacity=0.5,
            buy_spot_saf=0.1,
            sign_long_term_offtake=0.1,
            ground_routes=0.1,
        ),
        dominant_response="cut_capacity",
        reserve_signal="critical",
    )
    assert dashboard_contracts._decision_signal(assessment) == "capacity_stress_dominant"


def test_decision_signal_capacity_stress_elevated_ground_routes() -> None:
    assessment = AirlineDecisionAssessment(
        pathway=_SAMPLE_PATHWAY,
        fossil_jet_usd_per_l=1.5,
        reserve_weeks=3.0,
        carbon_price_eur_per_t=100.0,
        probabilities=AirlineDecisionProbabilities(
            raise_fares=0.2,
            cut_capacity=0.1,
            buy_spot_saf=0.1,
            sign_long_term_offtake=0.1,
            ground_routes=0.5,
        ),
        dominant_response="ground_routes",
        reserve_signal="elevated",
    )
    assert dashboard_contracts._decision_signal(assessment) == "capacity_stress_dominant"


def test_decision_signal_incremental_adjustment() -> None:
    assessment = AirlineDecisionAssessment(
        pathway=_SAMPLE_PATHWAY,
        fossil_jet_usd_per_l=1.5,
        reserve_weeks=10.0,
        carbon_price_eur_per_t=0.0,
        probabilities=AirlineDecisionProbabilities(
            raise_fares=0.5,
            cut_capacity=0.2,
            buy_spot_saf=0.1,
            sign_long_term_offtake=0.1,
            ground_routes=0.1,
        ),
        dominant_response="raise_fares",
        reserve_signal="normal",
    )
    assert dashboard_contracts._decision_signal(assessment) == "incremental_adjustment"


# ---------------------------------------------------------------------------
# _reserve_source_name
# ---------------------------------------------------------------------------

def test_reserve_source_name_manual() -> None:
    assert (
        dashboard_contracts._reserve_source_name("manual")
        == "IATA / EUROCONTROL curated estimate"
    )


def test_reserve_source_name_official() -> None:
    assert dashboard_contracts._reserve_source_name("official") == "IEA Oil Market Report"


def test_reserve_source_name_derived() -> None:
    assert (
        dashboard_contracts._reserve_source_name("derived")
        == "Derived reserve coverage model"
    )


def test_reserve_source_name_unknown_passthrough() -> None:
    assert dashboard_contracts._reserve_source_name("ml_model_v3") == "ml_model_v3"


# ---------------------------------------------------------------------------
# build_tipping_point_response  (monkeypatched)
# ---------------------------------------------------------------------------

def test_build_tipping_point_response(monkeypatch: pytest.MonkeyPatch) -> None:
    hefa = PathwayCostBand(
        pathway_key="hefa", name="HEFA", min_usd_per_l=1.0, max_usd_per_l=1.5,
        midpoint_usd_per_l=1.25, carbon_reduction_pct=70.0, maturity_level="commercial",
    )
    atj = PathwayCostBand(
        pathway_key="atj", name="ATJ", min_usd_per_l=1.3, max_usd_per_l=1.7,
        midpoint_usd_per_l=1.5, carbon_reduction_pct=65.0, maturity_level="early_commercial",
    )
    monkeypatch.setattr(dashboard_contracts, "list_pathway_costs", lambda: [hefa, atj])
    monkeypatch.setattr(dashboard_contracts, "utcnow", lambda: FIXED_NOW)

    def fake_tipping(**kw: Any) -> TippingPointAssessment:
        pk = kw.get("pathway_key", "hefa")
        if pk == "hefa":
            return TippingPointAssessment(
                pathway=hefa, fossil_jet_usd_per_l=kw["fossil_jet_usd_per_l"],
                carbon_price_eur_per_t=kw["carbon_price_eur_per_t"],
                subsidy_usd_per_l=kw["subsidy_usd_per_l"],
                blend_rate_pct=kw["blend_rate_pct"],
                carbon_credit_usd_per_l=0.0,
                effective_support_usd_per_l=kw["subsidy_usd_per_l"],
                net_saf_cost_usd_per_l=1.15, net_cost_spread_usd_per_l=-0.35,
                spread_pct=-23.33, status="dominant",
            )
        return TippingPointAssessment(
            pathway=atj, fossil_jet_usd_per_l=kw["fossil_jet_usd_per_l"],
            carbon_price_eur_per_t=kw["carbon_price_eur_per_t"],
            subsidy_usd_per_l=kw["subsidy_usd_per_l"],
            blend_rate_pct=kw["blend_rate_pct"],
            carbon_credit_usd_per_l=0.0,
            effective_support_usd_per_l=kw["subsidy_usd_per_l"],
            net_saf_cost_usd_per_l=1.45, net_cost_spread_usd_per_l=0.05,
            spread_pct=3.57, status="inflection",
        )

    monkeypatch.setattr(dashboard_contracts, "compute_tipping_point", fake_tipping)

    result = dashboard_contracts.build_tipping_point_response(
        fossil_jet_usd_per_l=1.5,
        carbon_price_eur_per_t=100.0,
        subsidy_usd_per_l=0.05,
        blend_rate_pct=50.0,
    )

    assert isinstance(result, TippingPointResponse)
    assert result.generated_at == FIXED_NOW
    assert result.inputs.fossil_jet_usd_per_l == 1.5
    assert result.inputs.blend_rate_pct == 50.0
    expected_fossil = dashboard_contracts._effective_fossil_jet_usd_per_l(1.5, 100.0, 50.0)
    assert result.effective_fossil_jet_usd_per_l == pytest.approx(expected_fossil)
    assert len(result.pathways) == 2
    assert result.pathways[0].pathway_key == "hefa"
    assert result.pathways[1].pathway_key == "atj"
    assert result.pathways[0].status == "competitive"
    assert result.pathways[1].status == "inflection"
    assert result.signal == "saf_cost_advantaged"


# ---------------------------------------------------------------------------
# build_airline_decision_response  (monkeypatched)
# ---------------------------------------------------------------------------

def test_build_airline_decision_response(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        dashboard_contracts, "get_pathway_cost", lambda pk: (
            PathwayCostBand(
                pathway_key=pk, name="HEFA", min_usd_per_l=1.0, max_usd_per_l=1.5,
                midpoint_usd_per_l=1.25, carbon_reduction_pct=70.0,
                maturity_level="commercial",
            )
        ),
    )
    monkeypatch.setattr(dashboard_contracts, "utcnow", lambda: FIXED_NOW)
    monkeypatch.setattr(
        dashboard_contracts, "compute_airline_decision",
        lambda **kw: AirlineDecisionAssessment(
            pathway=_SAMPLE_PATHWAY,
            fossil_jet_usd_per_l=kw["fossil_jet_usd_per_l"],
            reserve_weeks=kw["reserve_weeks"],
            carbon_price_eur_per_t=kw["carbon_price_eur_per_t"],
            probabilities=AirlineDecisionProbabilities(
                raise_fares=0.4, cut_capacity=0.1, buy_spot_saf=0.2,
                sign_long_term_offtake=0.2, ground_routes=0.1,
            ),
            dominant_response="raise_fares",
            reserve_signal="normal",
        ),
    )

    result = dashboard_contracts.build_airline_decision_response(
        fossil_jet_usd_per_l=1.5,
        reserve_weeks=10.0,
        carbon_price_eur_per_t=100.0,
        pathway_key="hefa",
    )

    assert result.generated_at == FIXED_NOW
    assert result.inputs.fossil_jet_usd_per_l == 1.5
    assert result.inputs.reserve_weeks == 10.0
    assert result.inputs.pathway_key == "hefa"
    assert result.probabilities.raise_fares == pytest.approx(0.4)
    assert result.probabilities.sign_long_term_offtake == pytest.approx(0.2)
    assert result.signal == "incremental_adjustment"


# ---------------------------------------------------------------------------
# build_eu_reserve_signal_response  (monkeypatched)
# ---------------------------------------------------------------------------

def test_build_eu_reserve_signal_response(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        dashboard_contracts, "get_eu_reserve_stress",
        lambda db=None: SimpleNamespace(
            observed_at=None,
            region="eu",
            coverage_days=21,
            stress_level="elevated",
            supply_gap_pct=25.0,
            source_type="manual",
            confidence=0.62,
        ),
    )
    monkeypatch.setattr(dashboard_contracts, "utcnow", lambda: FIXED_NOW)

    result = dashboard_contracts.build_eu_reserve_signal_response()

    assert result.generated_at == FIXED_NOW
    assert result.region == "eu"
    assert result.coverage_days == 21
    assert result.coverage_weeks == pytest.approx(3.0)
    assert result.stress_level == "elevated"
    assert result.estimated_supply_gap_pct == 25.0
    assert result.source_type == "manual"
    assert result.source_name == "IATA / EUROCONTROL curated estimate"
    assert result.confidence_score == pytest.approx(0.62)


class SimpleNamespace:
    """Minimal stand-in for types.SimpleNamespace so no stdlib import needed."""

    def __init__(self, **kwargs: Any) -> None:
        self.__dict__.update(kwargs)
