from __future__ import annotations

import pytest

from app.schemas.analysis import (
    AirlineDecisionAssessment,
    AirlineDecisionProbabilities,
)
from app.services.analysis.decision_matrix import (
    _clamp,
    _reserve_signal,
    compute_airline_decision,
)


class TestClamp:
    def test_clamps_below_zero(self):
        assert _clamp(-0.5) == 0.0

    def test_clamps_above_one(self):
        assert _clamp(1.5) == 1.0

    def test_passes_through_in_range(self):
        assert _clamp(0.5) == 0.5

    def test_rounds_to_three_decimals(self):
        assert _clamp(0.12345) == 0.123

    def test_edge_zero(self):
        assert _clamp(0.0) == 0.0

    def test_edge_one(self):
        assert _clamp(1.0) == 1.0


class TestReserveSignal:
    @pytest.mark.parametrize(
        ("weeks", "expected"),
        [
            (0, "critical"),
            (1, "critical"),
            (2, "critical"),
            (2.5, "elevated"),
            (3, "elevated"),
            (4, "elevated"),
            (5, "watch"),
            (6, "watch"),
            (6.5, "normal"),
            (10, "normal"),
            (100, "normal"),
        ],
    )
    def test_thresholds(self, weeks, expected):
        assert _reserve_signal(weeks) == expected


class TestComputeAirlineDecision:
    def test_returns_assessment_object(self):
        result = compute_airline_decision(
            fossil_jet_usd_per_l=1.0,
            reserve_weeks=6.0,
            carbon_price_eur_per_t=0.0,
            pathway_key="hefa",
        )
        assert isinstance(result, AirlineDecisionAssessment)
        assert isinstance(result.probabilities, AirlineDecisionProbabilities)
        assert isinstance(result.dominant_response, str)
        assert isinstance(result.reserve_signal, str)

    def test_normal_fuel_normal_reserve(self):
        """Baseline scenario: low fuel price, ample reserves, no carbon price."""
        result = compute_airline_decision(
            fossil_jet_usd_per_l=1.0,
            reserve_weeks=6.0,
            carbon_price_eur_per_t=0.0,
            pathway_key="hefa",
        )
        probs = result.probabilities
        # All probabilities should be in [0, 1]
        for p in [probs.raise_fares, probs.cut_capacity, probs.buy_spot_saf,
                  probs.sign_long_term_offtake, probs.ground_routes]:
            assert 0.0 <= p <= 1.0
        # At baseline (fuel=1.0, reserve=6.0, carbon=0):
        # raise_fares = 0.35 + 0 + 0 = 0.35
        assert probs.raise_fares == pytest.approx(0.35, abs=1e-3)
        # cut_capacity = 0.18 + 0 + 0 = 0.18
        assert probs.cut_capacity == pytest.approx(0.18, abs=1e-3)
        # buy_spot_saf = 0.08 + 0 + 0 + 0.12 = 0.20
        assert probs.buy_spot_saf == pytest.approx(0.20, abs=1e-3)
        # sign_long_term_offtake = 0.10 + 0 + 0.70 + 0.12 = 0.12  (or 0.10+0+0.70+0.12=0.92? wait)
        # pathway_readiness = 70/100 = 0.7, maturity_bonus for hefa (commercial) = 0.12
        # sign_long_term_offtake = 0.10 + 0.30*0 + 0.20*0.7 + 0.12 = 0.10 + 0 + 0.14 + 0.12 = 0.36
        assert probs.sign_long_term_offtake == pytest.approx(0.36, abs=1e-3)
        # ground_routes = 0.04 + 0 + 0 = 0.04
        assert probs.ground_routes == pytest.approx(0.04, abs=1e-3)

    def test_dominant_response_is_highest_probability(self):
        result = compute_airline_decision(
            fossil_jet_usd_per_l=2.0,
            reserve_weeks=1.0,
            carbon_price_eur_per_t=0.0,
            pathway_key="hefa",
        )
        probs = result.probabilities.model_dump()
        expected_dominant = max(probs.items(), key=lambda kv: kv[1])[0]
        assert result.dominant_response == expected_dominant

    def test_extreme_fuel_shock_and_scarcity(self):
        """High fuel price + near-zero reserves should push raise_fares to ceiling."""
        result = compute_airline_decision(
            fossil_jet_usd_per_l=2.0,
            reserve_weeks=0.001,
            carbon_price_eur_per_t=0.0,
            pathway_key="hefa",
        )
        # fuel_shock = (2.0 - 1.0) / 0.8 = 1.25 (not clamped in intermediate)
        # scarcity ≈ (6.0 - 0.001) / 6.0 ≈ 0.9998
        # raise_fares = clamp(0.35 + 0.35*1.25 + 0.25*0.9998) = clamp(1.0375) = 1.0
        assert result.probabilities.raise_fares == pytest.approx(1.0, abs=1e-3)
        assert result.reserve_signal == "critical"

    def test_high_carbon_price_boosts_saf_probs(self):
        """High carbon price should increase buy_spot_saf and sign_long_term_offtake."""
        result = compute_airline_decision(
            fossil_jet_usd_per_l=1.0,
            reserve_weeks=6.0,
            carbon_price_eur_per_t=200.0,
            pathway_key="hefa",
        )
        # carbon_pressure = 200/200 = 1.0
        # buy_spot_saf = 0.08 + 0.26*1.0 + 0.18*0 + 0.12 = 0.46
        assert result.probabilities.buy_spot_saf == pytest.approx(0.46, abs=1e-3)
        # sign_long_term_offtake = 0.10 + 0.30*1.0 + 0.20*0.7 + 0.12 = 0.66
        assert result.probabilities.sign_long_term_offtake == pytest.approx(0.66, abs=1e-3)

    def test_fossil_crisis_pathway_zero_readiness(self):
        """fossil_jet_crisis has 0% carbon reduction -> pathway_readiness=0, maturity_bonus=0."""
        result = compute_airline_decision(
            fossil_jet_usd_per_l=1.5,
            reserve_weeks=3.0,
            carbon_price_eur_per_t=100.0,
            pathway_key="fossil_jet_crisis",
        )
        probs = result.probabilities
        for p in [probs.raise_fares, probs.cut_capacity, probs.buy_spot_saf,
                  probs.sign_long_term_offtake, probs.ground_routes]:
            assert 0.0 <= p <= 1.0
        # maturity_level = "incumbent" -> bonus 0.0
        # sign_long_term_offtake = 0.10 + 0.30*0.5 + 0.20*0.0 + 0.0 = 0.10 + 0.15 = 0.25
        assert probs.sign_long_term_offtake == pytest.approx(0.25, abs=1e-3)

    def test_unknown_pathway_raises_keyerror(self):
        with pytest.raises(KeyError):
            compute_airline_decision(
                fossil_jet_usd_per_l=1.0,
                reserve_weeks=6.0,
                carbon_price_eur_per_t=0.0,
                pathway_key="nonexistent",
            )

    def test_narrowly_positive_inputs(self):
        """Edge: minimum valid inputs."""
        result = compute_airline_decision(
            fossil_jet_usd_per_l=0.01,
            reserve_weeks=0.01,
            carbon_price_eur_per_t=0.0,
            pathway_key="hefa",
        )
        assert isinstance(result, AirlineDecisionAssessment)
        for p in [result.probabilities.raise_fares, result.probabilities.cut_capacity]:
            assert 0.0 <= p <= 1.0
