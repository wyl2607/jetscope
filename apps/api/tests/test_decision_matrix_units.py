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
            saf_premium_pct=30.0,
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
            saf_premium_pct=30.0,
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
        # buy_spot_saf = 0.08 + 0.26*0 + 0 + 0.12 = 0.20
        assert probs.buy_spot_saf == pytest.approx(0.20, abs=1e-3)
        # sign_long_term_offtake = 0.10 + 0.50*0 + 0.12 = 0.22
        assert probs.sign_long_term_offtake == pytest.approx(0.22, abs=1e-3)
        # ground_routes = 0.04 + 0 + 0 = 0.04
        assert probs.ground_routes == pytest.approx(0.04, abs=1e-3)

    def test_dominant_response_is_highest_probability(self):
        result = compute_airline_decision(
            fossil_jet_usd_per_l=2.0,
            reserve_weeks=1.0,
            carbon_price_eur_per_t=0.0,
            pathway_key="hefa",
            saf_premium_pct=30.0,
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
            saf_premium_pct=30.0,
        )
        # fuel_shock = (2.0 - 1.0) / 0.8 = 1.25 (not clamped in intermediate)
        # scarcity ≈ (6.0 - 0.001) / 6.0 ≈ 0.9998
        # raise_fares = clamp(0.35 + 0.35*1.25 + 0.25*0.9998) = clamp(1.0375) = 1.0
        assert result.probabilities.raise_fares == pytest.approx(1.0, abs=1e-3)
        assert result.reserve_signal == "critical"

    @pytest.mark.parametrize(
        ("saf_premium_pct", "expected_spot", "expected_offtake"),
        [
            (0.0, 0.46, 0.72),
            (15.0, 0.33, 0.47),
            (30.0, 0.20, 0.22),
            (45.0, 0.20, 0.22),
        ],
    )
    def test_saf_probabilities_follow_buyer_premium(
        self, saf_premium_pct, expected_spot, expected_offtake
    ):
        """SAF pull is 1 at parity, 0.5 at 15%, and zero at/above 30%."""
        result = compute_airline_decision(
            fossil_jet_usd_per_l=1.0,
            reserve_weeks=6.0,
            carbon_price_eur_per_t=200.0,
            pathway_key="hefa",
            saf_premium_pct=saf_premium_pct,
        )
        assert result.probabilities.buy_spot_saf == pytest.approx(expected_spot, abs=1e-3)
        assert result.probabilities.sign_long_term_offtake == pytest.approx(expected_offtake, abs=1e-3)

    def test_non_saf_probabilities_ignore_buyer_premium(self):
        at_parity = compute_airline_decision(
            fossil_jet_usd_per_l=1.4,
            reserve_weeks=3.0,
            carbon_price_eur_per_t=200.0,
            pathway_key="hefa",
            saf_premium_pct=0.0,
        )
        at_high_premium = compute_airline_decision(
            fossil_jet_usd_per_l=1.4,
            reserve_weeks=3.0,
            carbon_price_eur_per_t=200.0,
            pathway_key="hefa",
            saf_premium_pct=30.0,
        )
        for key in ("raise_fares", "cut_capacity", "ground_routes"):
            assert getattr(at_parity.probabilities, key) == getattr(at_high_premium.probabilities, key)

    def test_fossil_crisis_pathway_uses_maturity_bonus_only(self):
        result = compute_airline_decision(
            fossil_jet_usd_per_l=1.5,
            reserve_weeks=3.0,
            carbon_price_eur_per_t=100.0,
            pathway_key="fossil_jet_crisis",
            saf_premium_pct=30.0,
        )
        probs = result.probabilities
        for p in [probs.raise_fares, probs.cut_capacity, probs.buy_spot_saf,
                  probs.sign_long_term_offtake, probs.ground_routes]:
            assert 0.0 <= p <= 1.0
        # maturity_level = "incumbent" -> bonus 0.0
        # With no SAF pull, off-take is its base rate plus maturity bonus.
        assert probs.sign_long_term_offtake == pytest.approx(0.10, abs=1e-3)

    def test_unknown_pathway_raises_keyerror(self):
        with pytest.raises(KeyError):
            compute_airline_decision(
                fossil_jet_usd_per_l=1.0,
                reserve_weeks=6.0,
                carbon_price_eur_per_t=0.0,
                pathway_key="nonexistent",
                saf_premium_pct=30.0,
            )

    def test_narrowly_positive_inputs(self):
        """Edge: minimum valid inputs."""
        result = compute_airline_decision(
            fossil_jet_usd_per_l=0.01,
            reserve_weeks=0.01,
            carbon_price_eur_per_t=0.0,
            pathway_key="hefa",
            saf_premium_pct=30.0,
        )
        assert isinstance(result, AirlineDecisionAssessment)
        for p in [result.probabilities.raise_fares, result.probabilities.cut_capacity]:
            assert 0.0 <= p <= 1.0
