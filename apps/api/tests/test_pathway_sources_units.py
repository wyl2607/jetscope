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

from app.services.analysis import pathway_sources
from app.services.analysis.pathway_costs import PATHWAY_COSTS
from app.services.analysis.pathway_sources import get_pathway_source, list_pathway_sources


def test_get_pathway_source_normalizes_key_and_maps_maturity_confidence() -> None:
    source = get_pathway_source(" HEFA ")

    assert source["source_type"] == "manual"
    assert source["confidence_score"] == pytest.approx(0.8)
    assert source["cadence"] == "quarterly"
    assert source["updated_at"] == "2026-04-23"
    assert source["fallback_used"] is False


def test_get_pathway_source_returns_copy_not_internal_state() -> None:
    source = get_pathway_source("atj")
    source["source_type"] = "official"
    source["confidence_score"] = 0.0

    fresh_source = get_pathway_source("atj")

    assert fresh_source["source_type"] == "manual"
    assert fresh_source["confidence_score"] == pytest.approx(0.65)


def test_list_pathway_sources_covers_cost_pathways_and_returns_copies() -> None:
    sources = list_pathway_sources()
    sources["ptl"]["cadence"] = "monthly"

    fresh_sources = list_pathway_sources()

    assert set(sources) == set(PATHWAY_COSTS)
    assert fresh_sources["ptl"]["confidence_score"] == pytest.approx(0.5)
    assert fresh_sources["ptl"]["cadence"] == "quarterly"
    assert fresh_sources["fossil_jet_crisis"]["confidence_score"] == pytest.approx(0.7)


def test_get_pathway_source_raises_key_error_with_original_key() -> None:
    with pytest.raises(KeyError) as exc_info:
        get_pathway_source(" missing-pathway ")

    assert exc_info.value.args == (" missing-pathway ",)


def test_get_pathway_source_rejects_invalid_source_type(monkeypatch: pytest.MonkeyPatch) -> None:
    patched_sources = list_pathway_sources()
    patched_sources["hefa"]["source_type"] = "spreadsheet"
    monkeypatch.setattr(pathway_sources, "_PATHWAY_SOURCES", patched_sources)

    with pytest.raises(ValueError, match="Invalid source type for hefa"):
        get_pathway_source("hefa")
