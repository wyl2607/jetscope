from datetime import date

import pytest

from app.services.analysis import pathway_sources
from app.services.analysis.pathway_costs import PATHWAY_COSTS
from app.services.analysis.pathway_sources import (
    STALE_CONFIDENCE_CAP,
    get_pathway_source,
    is_pathway_source_stale,
    list_pathway_sources,
)


def test_get_pathway_source_normalizes_key_and_maps_maturity_confidence() -> None:
    # Pin as_of inside the curated cadence window so this asserts the fresh path.
    source = get_pathway_source(" HEFA ", as_of=date(2026, 5, 1))

    assert source["source_type"] == "manual"
    assert source["confidence_score"] == pytest.approx(0.8)
    assert source["cadence"] == "quarterly"
    assert source["updated_at"] == "2026-04-23"
    assert source["fallback_used"] is False


def test_get_pathway_source_returns_copy_not_internal_state() -> None:
    source = get_pathway_source("atj", as_of=date(2026, 5, 1))
    source["source_type"] = "official"
    source["confidence_score"] = 0.0

    fresh_source = get_pathway_source("atj", as_of=date(2026, 5, 1))

    assert fresh_source["source_type"] == "manual"
    assert fresh_source["confidence_score"] == pytest.approx(0.65)


def test_list_pathway_sources_covers_cost_pathways_and_returns_copies() -> None:
    sources = list_pathway_sources(as_of=date(2026, 5, 1))
    sources["ptl"]["cadence"] = "monthly"

    fresh_sources = list_pathway_sources(as_of=date(2026, 5, 1))

    assert set(sources) == set(PATHWAY_COSTS)
    assert fresh_sources["ptl"]["confidence_score"] == pytest.approx(0.5)
    assert fresh_sources["ptl"]["cadence"] == "quarterly"
    assert fresh_sources["fossil_jet_crisis"]["confidence_score"] == pytest.approx(0.7)


def test_get_pathway_source_raises_key_error_with_original_key() -> None:
    with pytest.raises(KeyError) as exc_info:
        get_pathway_source(" missing-pathway ")

    assert exc_info.value.args == (" missing-pathway ",)


def test_get_pathway_source_rejects_invalid_source_type(monkeypatch: pytest.MonkeyPatch) -> None:
    patched_sources = list_pathway_sources(as_of=date(2026, 5, 1))
    patched_sources["hefa"]["source_type"] = "spreadsheet"
    monkeypatch.setattr(pathway_sources, "_PATHWAY_SOURCES", patched_sources)

    with pytest.raises(ValueError, match="Invalid source type for hefa"):
        get_pathway_source("hefa", as_of=date(2026, 5, 1))


def test_is_pathway_source_stale_respects_quarterly_cadence() -> None:
    assert (
        is_pathway_source_stale("2026-04-23", "quarterly", as_of=date(2026, 5, 1))
        is False
    )
    assert (
        is_pathway_source_stale("2026-04-23", "quarterly", as_of=date(2026, 8, 10))
        is True
    )


def test_stale_pathway_source_marks_fallback_and_caps_confidence() -> None:
    """Regression: stale curated SAF proxies must surface fallback + weak confidence."""
    source = get_pathway_source("hefa", as_of=date(2026, 8, 15))

    assert source["fallback_used"] is True
    assert source["confidence_score"] == pytest.approx(STALE_CONFIDENCE_CAP)
    assert 0.30 <= source["confidence_score"] <= 0.49


def test_stale_pathway_list_applies_fallback_semantics_to_all_rows() -> None:
    sources = list_pathway_sources(as_of=date(2026, 9, 1))

    assert sources
    assert all(row["fallback_used"] is True for row in sources.values())
    assert all(row["confidence_score"] <= STALE_CONFIDENCE_CAP for row in sources.values())


def test_stale_cap_does_not_raise_low_maturity_confidence() -> None:
    # Demonstration maturity already sits at 0.50; after stale cap it should not exceed 0.49.
    source = get_pathway_source("ptl", as_of=date(2026, 8, 15))

    assert source["fallback_used"] is True
    assert source["confidence_score"] == pytest.approx(STALE_CONFIDENCE_CAP)
