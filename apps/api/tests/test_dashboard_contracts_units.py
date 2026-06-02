from datetime import UTC, datetime

import pytest

from app.schemas.analysis import (
    AirlineDecisionAssessment,
    AirlineDecisionProbabilities,
    PathwayCostBand,
    TippingPointAssessment,
)
from app.schemas.reserves import ReserveStressResponse
from app.services.analysis import dashboard_contracts as contracts


def _pathway(pathway_key: str, name: str, low: float, high: float) -> PathwayCostBand:
    return PathwayCostBand(
        pathway_key=pathway_key,
        name=name,
        min_usd_per_l=low,
        max_usd_per_l=high,
        midpoint_usd_per_l=(low + high) / 2.0,
        carbon_reduction_pct=70.0,
        maturity_level="test",
    )


def test_tipping_point_response_orders_known_pathways_and_sets_advantaged_signal(monkeypatch) -> None:
    hefa = _pathway("hefa", "HEFA", 0.90, 0.95)
    ptl = _pathway("ptl", "Power-to-Liquid", 2.00, 2.20)
    unknown = _pathway("unknown", "Unknown", 0.50, 0.60)

    monkeypatch.setattr(contracts, "list_pathway_costs", lambda: [ptl, unknown, hefa])

    def fake_compute_tipping_point(**kwargs):
        pathway = {"hefa": hefa, "ptl": ptl}[kwargs["pathway_key"]]
        return TippingPointAssessment(
            pathway=pathway,
            fossil_jet_usd_per_l=kwargs["fossil_jet_usd_per_l"],
            carbon_price_eur_per_t=kwargs["carbon_price_eur_per_t"],
            subsidy_usd_per_l=kwargs["subsidy_usd_per_l"],
            blend_rate_pct=kwargs["blend_rate_pct"],
            carbon_credit_usd_per_l=0.0,
            effective_support_usd_per_l=0.0,
            net_saf_cost_usd_per_l=pathway.midpoint_usd_per_l,
            net_cost_spread_usd_per_l=pathway.midpoint_usd_per_l - kwargs["fossil_jet_usd_per_l"],
            spread_pct=0.0,
            status="inflection",
        )

    monkeypatch.setattr(contracts, "compute_tipping_point", fake_compute_tipping_point)
    generated_at = datetime(2030, 1, 2, 3, 4, 5, tzinfo=UTC)
    monkeypatch.setattr(contracts, "utcnow", lambda: generated_at)

    response = contracts.build_tipping_point_response(
        fossil_jet_usd_per_l=1.0,
        carbon_price_eur_per_t=0.0,
        subsidy_usd_per_l=0.0,
        blend_rate_pct=100.0,
    )

    assert response.generated_at == generated_at
    assert [row.pathway_key for row in response.pathways] == ["hefa", "ptl"]
    assert response.pathways[0].status == "competitive"
    assert response.pathways[0].spread_low_pct == pytest.approx(-10.0)
    assert response.signal == "saf_cost_advantaged"


def test_airline_decision_response_uses_real_signal_mapping_and_preserves_inputs(monkeypatch) -> None:
    pathway = _pathway("hefa", "HEFA", 1.0, 1.5)
    probabilities = AirlineDecisionProbabilities(
        raise_fares=0.10,
        cut_capacity=0.15,
        buy_spot_saf=0.20,
        sign_long_term_offtake=0.45,
        ground_routes=0.10,
    )
    seen_pathway_keys: list[str] = []

    def fake_get_pathway_cost(pathway_key: str):
        seen_pathway_keys.append(pathway_key)
        return pathway

    def fake_compute_airline_decision(**kwargs):
        return AirlineDecisionAssessment(
            pathway=pathway,
            fossil_jet_usd_per_l=kwargs["fossil_jet_usd_per_l"],
            reserve_weeks=kwargs["reserve_weeks"],
            carbon_price_eur_per_t=kwargs["carbon_price_eur_per_t"],
            probabilities=probabilities,
            dominant_response="sign_long_term_offtake",
            reserve_signal="normal",
        )

    monkeypatch.setattr(contracts, "get_pathway_cost", fake_get_pathway_cost)
    monkeypatch.setattr(contracts, "compute_airline_decision", fake_compute_airline_decision)
    monkeypatch.setattr(contracts, "utcnow", lambda: datetime(2030, 1, 1, tzinfo=UTC))

    response = contracts.build_airline_decision_response(
        fossil_jet_usd_per_l=1.4,
        reserve_weeks=2.5,
        carbon_price_eur_per_t=90.0,
        pathway_key="hefa",
    )

    assert seen_pathway_keys == ["hefa"]
    assert response.inputs.pathway_key == "hefa"
    assert response.inputs.reserve_weeks == pytest.approx(2.5)
    assert response.probabilities.sign_long_term_offtake == pytest.approx(0.45)
    assert response.signal == "switch_window_opening"


def test_reserve_signal_response_maps_source_and_rounds_coverage_weeks(monkeypatch) -> None:
    observed_at = datetime(2031, 6, 7, 8, 9, 10, tzinfo=UTC)
    stress = ReserveStressResponse(
        region="eu",
        coverage_days=11,
        stress_level="critical",
        supply_gap_pct=37.5,
        source_type="official",
        confidence=0.91,
        observed_at=observed_at,
    )
    monkeypatch.setattr(contracts, "get_eu_reserve_stress", lambda db=None: stress)

    response = contracts.build_eu_reserve_signal_response(db=object())

    assert response.generated_at == observed_at
    assert response.coverage_weeks == pytest.approx(1.57)
    assert response.source_name == "IEA Oil Market Report"
    assert response.estimated_supply_gap_pct == pytest.approx(37.5)
    assert response.confidence_score == pytest.approx(0.91)


def test_pathway_comparison_response_attaches_sources_sweep_and_signal(monkeypatch) -> None:
    from app.services.analysis import pathway_costs, pathway_sources

    def fake_compare_pathways(**kwargs):
        return [
            {
                "pathway_key": "hefa",
                "name": "HEFA",
                "min_usd_per_l": 1.0,
                "max_usd_per_l": 1.5,
                "midpoint_usd_per_l": 1.25,
                "carbon_reduction_pct": 70.0,
                "maturity_level": "commercial",
                "effective_saf_cost_usd_per_l": 0.95,
                "gap_vs_fossil_usd_per_l": -0.05,
                "spread_pct": -5.0,
                "status": "below_fossil",
            },
            {
                "pathway_key": "atj",
                "name": "ATJ",
                "min_usd_per_l": 1.3,
                "max_usd_per_l": 1.7,
                "midpoint_usd_per_l": 1.5,
                "carbon_reduction_pct": 65.0,
                "maturity_level": "early_commercial",
                "effective_saf_cost_usd_per_l": 1.20,
                "gap_vs_fossil_usd_per_l": 0.20,
                "spread_pct": 20.0,
                "status": "inflection",
            },
        ]

    def fake_carbon_price_sweep(**kwargs):
        return [
            {
                "carbon_price_eur_per_t": 0.0,
                "pathways": [{"pathway_key": "hefa", "effective_saf_cost_usd_per_l": 0.95}],
            },
            {
                "carbon_price_eur_per_t": 50.0,
                "pathways": [{"pathway_key": "hefa", "effective_saf_cost_usd_per_l": 0.85}],
            },
        ]

    monkeypatch.setattr(pathway_costs, "compare_pathways", fake_compare_pathways)
    monkeypatch.setattr(pathway_costs, "carbon_price_sweep", fake_carbon_price_sweep)
    monkeypatch.setattr(
        pathway_sources,
        "get_pathway_source",
        lambda pathway_key: {
            "source_type": "manual",
            "confidence_score": 0.8,
            "cadence": "quarterly",
            "updated_at": "2030-01-01",
            "fallback_used": False,
        },
    )
    monkeypatch.setattr(contracts, "utcnow", lambda: datetime(2030, 1, 1, tzinfo=UTC))

    response = contracts.build_pathway_comparison_response(
        fossil_jet_usd_per_l=1.0,
        carbon_price_eur_per_t=10.0,
        carbon_sweep_min=0.0,
        carbon_sweep_max=50.0,
        carbon_sweep_step=50.0,
    )

    assert response.signal == "clear_leader"
    assert [row.pathway_key for row in response.rows] == ["hefa", "atj"]
    assert response.rows[0].source.source_type == "manual"
    assert [point.carbon_price_eur_per_t for point in response.carbon_sweep] == [0.0, 50.0]
    assert response.carbon_sweep[1].pathways[0].effective_saf_cost_usd_per_l == pytest.approx(0.85)
