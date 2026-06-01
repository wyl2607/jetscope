import pytest

from app.schemas.analysis import AirlineDecisionResponse, TippingPointResponse
from app.schemas.reserves import ReserveSignalResponse
from app.services.analysis.dashboard_contracts import (
    build_airline_decision_response,
    build_eu_reserve_signal_response,
    build_tipping_point_response,
)


def _expected_pathway_status(effective_fossil: float, net_low: float, net_high: float) -> str:
    if net_high <= effective_fossil:
        return "competitive"
    if net_low <= effective_fossil or ((net_low - effective_fossil) / effective_fossil) <= 0.15:
        return "inflection"
    return "premium"


def test_build_tipping_point_response_populates_consistent_pathway_contract() -> None:
    response = build_tipping_point_response(
        fossil_jet_usd_per_l=1.15,
        carbon_price_eur_per_t=100.0,
        subsidy_usd_per_l=0.20,
        blend_rate_pct=50.0,
    )

    assert isinstance(response, TippingPointResponse)
    assert response.inputs.fossil_jet_usd_per_l == 1.15
    assert response.inputs.carbon_price_eur_per_t == 100.0
    assert response.inputs.subsidy_usd_per_l == 0.20
    assert response.inputs.blend_rate_pct == 50.0
    assert response.effective_fossil_jet_usd_per_l > response.inputs.fossil_jet_usd_per_l
    assert [pathway.pathway_key for pathway in response.pathways] == ["hefa", "atj", "ft", "ptl"]

    statuses = {pathway.status for pathway in response.pathways}
    for pathway in response.pathways:
        assert pathway.net_cost_low_usd_per_l > 0
        assert pathway.net_cost_high_usd_per_l >= pathway.net_cost_low_usd_per_l
        assert pathway.spread_low_pct == pytest.approx(
            round(
                (
                    (pathway.net_cost_low_usd_per_l - response.effective_fossil_jet_usd_per_l)
                    / response.effective_fossil_jet_usd_per_l
                )
                * 100.0,
                2,
            ),
            abs=0.02,
        )
        assert pathway.spread_high_pct == pytest.approx(
            round(
                (
                    (pathway.net_cost_high_usd_per_l - response.effective_fossil_jet_usd_per_l)
                    / response.effective_fossil_jet_usd_per_l
                )
                * 100.0,
                2,
            ),
            abs=0.02,
        )
        assert pathway.spread_high_pct >= pathway.spread_low_pct
        assert pathway.status == _expected_pathway_status(
            response.effective_fossil_jet_usd_per_l,
            pathway.net_cost_low_usd_per_l,
            pathway.net_cost_high_usd_per_l,
        )

    if "competitive" in statuses:
        assert response.signal == "saf_cost_advantaged"
    elif "inflection" in statuses:
        assert response.signal == "switch_window_opening"
    else:
        assert response.signal == "fossil_still_advantaged"


def test_build_airline_decision_response_populates_probabilities_and_signal() -> None:
    response = build_airline_decision_response(
        fossil_jet_usd_per_l=1.30,
        reserve_weeks=3.0,
        carbon_price_eur_per_t=120.0,
        pathway_key="hefa",
    )

    assert isinstance(response, AirlineDecisionResponse)
    assert response.inputs.fossil_jet_usd_per_l == 1.30
    assert response.inputs.reserve_weeks == 3.0
    assert response.inputs.carbon_price_eur_per_t == 120.0
    assert response.inputs.pathway_key == "hefa"

    probabilities = response.probabilities.model_dump()
    assert set(probabilities) == {
        "raise_fares",
        "cut_capacity",
        "buy_spot_saf",
        "sign_long_term_offtake",
        "ground_routes",
    }
    assert all(0.0 <= probability <= 1.0 for probability in probabilities.values())
    assert all(round(probability, 3) == probability for probability in probabilities.values())

    dominant_response = max(probabilities.items(), key=lambda item: item[1])[0]
    if dominant_response == "sign_long_term_offtake":
        assert response.signal == "switch_window_opening"
    else:
        assert response.signal == "incremental_adjustment"


def test_build_eu_reserve_signal_response_uses_plain_fallback_without_database() -> None:
    response = build_eu_reserve_signal_response()

    assert isinstance(response, ReserveSignalResponse)
    assert response.region == "eu"
    assert response.coverage_days == 20
    assert response.coverage_weeks == pytest.approx(round(response.coverage_days / 7.0, 2))
    assert response.stress_level == "elevated"
    assert response.estimated_supply_gap_pct == 25.0
    assert response.source_type == "manual"
    assert response.source_name == "IATA / EUROCONTROL curated estimate"
    assert response.confidence_score == pytest.approx(0.62)
    assert 0.0 <= response.estimated_supply_gap_pct <= 100.0
    assert 0.0 <= response.confidence_score <= 1.0
