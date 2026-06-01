import pytest

from app.schemas.analysis import AirlineDecisionAssessment
from app.services.analysis.decision_matrix import (
    _clamp,
    _reserve_signal,
    compute_airline_decision,
)


@pytest.mark.parametrize(
    ("reserve_weeks", "expected_signal"),
    [
        (2, "critical"),
        (4, "elevated"),
        (6, "watch"),
        (12, "normal"),
    ],
)
def test_reserve_signal_threshold_boundaries(reserve_weeks: float, expected_signal: str) -> None:
    assert _reserve_signal(reserve_weeks) == expected_signal


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (-0.25, 0.0),
        (0.0, 0.0),
        (0.1236, 0.124),
        (0.9994, 0.999),
        (1.0, 1.0),
        (1.25, 1.0),
    ],
)
def test_clamp_limits_values_and_rounds_to_three_decimals(value: float, expected: float) -> None:
    assert _clamp(value) == expected


def test_compute_airline_decision_returns_consistent_assessment() -> None:
    assessment = compute_airline_decision(
        fossil_jet_usd_per_l=1.45,
        reserve_weeks=4,
        carbon_price_eur_per_t=100,
        pathway_key="hefa",
    )

    assert isinstance(assessment, AirlineDecisionAssessment)
    assert assessment.pathway.pathway_key == "hefa"
    assert assessment.reserve_signal == _reserve_signal(assessment.reserve_weeks)

    probabilities = assessment.probabilities.model_dump()
    assert all(0.0 <= probability <= 1.0 for probability in probabilities.values())
    assert assessment.dominant_response == max(probabilities, key=probabilities.get)


def test_high_fuel_shock_and_scarcity_raise_fares_and_cut_capacity() -> None:
    baseline = compute_airline_decision(
        fossil_jet_usd_per_l=1.0,
        reserve_weeks=8,
        carbon_price_eur_per_t=0,
        pathway_key="hefa",
    )
    stressed = compute_airline_decision(
        fossil_jet_usd_per_l=1.8,
        reserve_weeks=1,
        carbon_price_eur_per_t=0,
        pathway_key="hefa",
    )

    assert stressed.probabilities.raise_fares > baseline.probabilities.raise_fares
    assert stressed.probabilities.cut_capacity > baseline.probabilities.cut_capacity
