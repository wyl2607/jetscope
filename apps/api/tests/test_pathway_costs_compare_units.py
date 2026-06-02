import sys
import types

import pytest


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


analysis_stub = types.ModuleType("app.schemas.analysis")
analysis_stub.PathwayCostBand = _PathwayCostBandStub
sys.modules.setdefault("app.schemas.analysis", analysis_stub)

from app.services.analysis.pathway_costs import PATHWAY_COSTS, carbon_price_sweep, compare_pathways
from app.services.analysis.pathway_sources import list_pathway_sources


def _find_result(results: list[dict], pathway_key: str) -> dict:
    return next(item for item in results if item["pathway_key"] == pathway_key)


def test_compare_pathways_gap_and_spread_math_for_hefa() -> None:
    fossil = 1.20
    results = compare_pathways(fossil_jet_usd_per_l=fossil)

    hefa = _find_result(results, "hefa")
    expected_effective = PATHWAY_COSTS["hefa"].midpoint_usd_per_l
    expected_gap = expected_effective - fossil
    expected_spread = (expected_gap / fossil) * 100.0

    assert hefa["effective_saf_cost_usd_per_l"] == pytest.approx(expected_effective, abs=1e-9)
    assert hefa["gap_vs_fossil_usd_per_l"] == pytest.approx(expected_gap, abs=1e-9)
    assert hefa["spread_pct"] == pytest.approx(expected_spread, abs=1e-9)


def test_compare_pathways_status_below_fossil() -> None:
    results = compare_pathways(fossil_jet_usd_per_l=2.0)
    hefa = _find_result(results, "hefa")

    assert hefa["status"] == "below_fossil"


def test_compare_pathways_status_competitive() -> None:
    results = compare_pathways(fossil_jet_usd_per_l=1.20)
    hefa = _find_result(results, "hefa")

    assert hefa["status"] == "competitive"


def test_compare_pathways_status_inflection() -> None:
    results = compare_pathways(fossil_jet_usd_per_l=1.00)
    hefa = _find_result(results, "hefa")

    assert hefa["status"] == "inflection"


def test_compare_pathways_status_premium() -> None:
    results = compare_pathways(fossil_jet_usd_per_l=0.80)
    hefa = _find_result(results, "hefa")

    assert hefa["status"] == "premium"


def test_compare_pathways_not_computable_for_zero_fossil_price() -> None:
    results = compare_pathways(fossil_jet_usd_per_l=0.0)
    hefa = _find_result(results, "hefa")

    assert hefa["spread_pct"] is None
    assert hefa["status"] == "not_computable"


def test_carbon_price_sweep_point_count_and_non_fossil_filtering() -> None:
    sweep = carbon_price_sweep(
        fossil_jet_usd_per_l=1.1,
        carbon_min=0.0,
        carbon_max=200.0,
        step=50.0,
    )

    assert len(sweep) == 5
    assert [point["carbon_price_eur_per_t"] for point in sweep] == [0.0, 50.0, 100.0, 150.0, 200.0]

    first_keys = {entry["pathway_key"] for entry in sweep[0]["pathways"]}
    compare_keys = {entry["pathway_key"] for entry in compare_pathways(fossil_jet_usd_per_l=1.1)}

    assert "fossil_jet_crisis" not in first_keys
    assert "fossil_jet_crisis" not in compare_keys
    assert first_keys == compare_keys


def test_carbon_price_sweep_raises_for_non_positive_step() -> None:
    with pytest.raises(ValueError, match="step must be > 0"):
        carbon_price_sweep(
            fossil_jet_usd_per_l=1.0,
            carbon_min=0.0,
            carbon_max=100.0,
            step=0.0,
        )


def test_carbon_price_sweep_raises_for_inverted_range() -> None:
    with pytest.raises(ValueError, match="carbon_max must be >= carbon_min"):
        carbon_price_sweep(
            fossil_jet_usd_per_l=1.0,
            carbon_min=100.0,
            carbon_max=50.0,
            step=10.0,
        )


def test_pathway_sources_cover_all_keys_and_validate_fields() -> None:
    sources = list_pathway_sources()
    allowed_source_types = {"official", "market_primary", "public_proxy", "derived", "manual"}

    assert set(sources.keys()) == set(PATHWAY_COSTS.keys())
    for source in sources.values():
        assert source["source_type"] in allowed_source_types
        assert 0.0 <= source["confidence_score"] <= 1.0
        assert source["cadence"] == "quarterly"
        assert source["updated_at"] == "2026-04-23"
        assert source["fallback_used"] is False
