from __future__ import annotations

import sys
import types


class _PathwayCostBandStub:
    def __init__(
        self,
        pathway_key: str,
        name: str,
        min_usd_per_l: float,
        max_usd_per_l: float,
        midpoint_usd_per_l: float,
        carbon_reduction_pct: float,
        maturity_level: str,
    ) -> None:
        self.pathway_key = pathway_key
        self.name = name
        self.min_usd_per_l = min_usd_per_l
        self.max_usd_per_l = max_usd_per_l
        self.midpoint_usd_per_l = midpoint_usd_per_l
        self.carbon_reduction_pct = carbon_reduction_pct
        self.maturity_level = maturity_level


class _AirlineDecisionProbabilitiesStub:
    def __init__(
        self,
        raise_fares: float,
        cut_capacity: float,
        buy_spot_saf: float,
        sign_long_term_offtake: float,
        ground_routes: float,
    ) -> None:
        self.raise_fares = raise_fares
        self.cut_capacity = cut_capacity
        self.buy_spot_saf = buy_spot_saf
        self.sign_long_term_offtake = sign_long_term_offtake
        self.ground_routes = ground_routes

    def model_dump(self) -> dict[str, float]:
        return {
            "raise_fares": self.raise_fares,
            "cut_capacity": self.cut_capacity,
            "buy_spot_saf": self.buy_spot_saf,
            "sign_long_term_offtake": self.sign_long_term_offtake,
            "ground_routes": self.ground_routes,
        }


class _AirlineDecisionAssessmentStub:
    def __init__(self, **kwargs) -> None:  # noqa: ANN003
        self.__dict__.update(kwargs)


analysis_stub = types.ModuleType("app.schemas.analysis")
analysis_stub.PathwayCostBand = _PathwayCostBandStub
analysis_stub.AirlineDecisionProbabilities = _AirlineDecisionProbabilitiesStub
analysis_stub.AirlineDecisionAssessment = _AirlineDecisionAssessmentStub
sys.modules.setdefault("app.schemas.analysis", analysis_stub)

from app.services.analysis import decision_matrix


def _pathway(
    *,
    pathway_key: str = "demo",
    carbon_reduction_pct: float = 80.0,
    maturity_level: str = "scaling",
) -> _PathwayCostBandStub:
    return _PathwayCostBandStub(
        pathway_key=pathway_key,
        name="Demo Pathway",
        min_usd_per_l=1.0,
        max_usd_per_l=2.0,
        midpoint_usd_per_l=1.5,
        carbon_reduction_pct=carbon_reduction_pct,
        maturity_level=maturity_level,
    )


def test_compute_airline_decision_uses_pathway_and_expected_probability_math(monkeypatch) -> None:
    requested_keys: list[str] = []
    pathway = _pathway(pathway_key="atj", carbon_reduction_pct=65.0, maturity_level="early_commercial")

    def fake_get_pathway_cost(pathway_key: str) -> _PathwayCostBandStub:
        requested_keys.append(pathway_key)
        return pathway

    monkeypatch.setattr(decision_matrix, "get_pathway_cost", fake_get_pathway_cost)

    assessment = decision_matrix.compute_airline_decision(
        fossil_jet_usd_per_l=1.4,
        reserve_weeks=3.0,
        carbon_price_eur_per_t=100.0,
        pathway_key="ATJ",
    )

    assert requested_keys == ["ATJ"]
    assert assessment.pathway is pathway
    assert assessment.reserve_signal == "elevated"
    assert assessment.probabilities.raise_fares == 0.65
    assert assessment.probabilities.cut_capacity == 0.44
    assert assessment.probabilities.buy_spot_saf == 0.38
    assert assessment.probabilities.sign_long_term_offtake == 0.46
    assert assessment.probabilities.ground_routes == 0.25
    assert assessment.dominant_response == "raise_fares"


def test_compute_airline_decision_clamps_probabilities_and_reports_critical_reserves(monkeypatch) -> None:
    monkeypatch.setattr(
        decision_matrix,
        "get_pathway_cost",
        lambda pathway_key: _pathway(
            pathway_key=pathway_key,
            carbon_reduction_pct=100.0,
            maturity_level="commercial",
        ),
    )

    assessment = decision_matrix.compute_airline_decision(
        fossil_jet_usd_per_l=3.0,
        reserve_weeks=1.0,
        carbon_price_eur_per_t=400.0,
        pathway_key="hefa",
    )

    assert assessment.reserve_signal == "critical"
    assert assessment.probabilities.raise_fares == 1.0
    assert assessment.probabilities.buy_spot_saf == 0.87
    assert assessment.probabilities.sign_long_term_offtake == 1.0
    assert assessment.probabilities.cut_capacity == 0.947
    assert assessment.probabilities.ground_routes == 0.59
    assert assessment.dominant_response == "raise_fares"


def test_compute_airline_decision_reserve_signal_boundaries(monkeypatch) -> None:
    monkeypatch.setattr(decision_matrix, "get_pathway_cost", lambda pathway_key: _pathway(pathway_key=pathway_key))

    signals = [
        decision_matrix.compute_airline_decision(1.0, reserve_weeks, 0.0, "demo").reserve_signal
        for reserve_weeks in (2.0, 4.0, 6.0, 6.1)
    ]

    assert signals == ["critical", "elevated", "watch", "normal"]
