import math

import pytest

from app.services.analysis.policy_pressure import (
    eu_ets_pressure_curve,
    eu_ets_pressure_source,
    pressure_signal,
)
from app.services.analysis.pathway_costs import EUR_TO_USD, FOSSIL_JET_EMISSIONS_KG_PER_L


def test_curve_point_count_matches_sweep():
    curve = eu_ets_pressure_curve(fossil_jet_usd_per_l=1.0, eu_ets_min=0, eu_ets_max=100, eu_ets_step=25)
    assert [p["eu_ets_eur_per_t"] for p in curve] == [0, 25, 50, 75, 100]


def test_carbon_cost_formula_matches_factors():
    curve = eu_ets_pressure_curve(fossil_jet_usd_per_l=1.0, eu_ets_min=100, eu_ets_max=100, eu_ets_step=10)
    expected = 100 * EUR_TO_USD * (FOSSIL_JET_EMISSIONS_KG_PER_L / 1000.0)
    assert curve[0]["carbon_cost_usd_per_l"] == pytest.approx(expected)
    assert curve[0]["effective_fossil_jet_usd_per_l"] == pytest.approx(1.0 + expected)
    assert curve[0]["pressure_pct"] == pytest.approx(expected * 100.0)


def test_exempt_blend_reduces_carbon_cost():
    full = eu_ets_pressure_curve(fossil_jet_usd_per_l=1.0, eu_ets_min=100, eu_ets_max=100, eu_ets_step=10)
    half = eu_ets_pressure_curve(
        fossil_jet_usd_per_l=1.0, exempt_blend_pct=50, eu_ets_min=100, eu_ets_max=100, eu_ets_step=10
    )
    assert half[0]["carbon_cost_usd_per_l"] == pytest.approx(full[0]["carbon_cost_usd_per_l"] * 0.5)


def test_pressure_none_when_fossil_zero():
    curve = eu_ets_pressure_curve(fossil_jet_usd_per_l=0.0, eu_ets_min=50, eu_ets_max=50, eu_ets_step=10)
    assert curve[0]["pressure_pct"] is None


def test_invalid_sweep_raises():
    with pytest.raises(ValueError):
        eu_ets_pressure_curve(fossil_jet_usd_per_l=1.0, eu_ets_min=0, eu_ets_max=100, eu_ets_step=0)
    with pytest.raises(ValueError):
        eu_ets_pressure_curve(fossil_jet_usd_per_l=1.0, eu_ets_min=100, eu_ets_max=50, eu_ets_step=10)


def test_signal_thresholds():
    assert pressure_signal([{"pressure_pct": 5}]) == "low"
    assert pressure_signal([{"pressure_pct": 20}]) == "moderate"
    assert pressure_signal([{"pressure_pct": 40}]) == "high"
    assert pressure_signal([{"pressure_pct": 80}]) == "severe"
    assert pressure_signal([{"pressure_pct": None}]) == "low"


def test_source_shape():
    src = eu_ets_pressure_source()
    assert src["source_type"] == "derived"
    assert 0 <= src["confidence_score"] <= 1
    assert src["fallback_used"] is False
