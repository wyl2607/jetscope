from __future__ import annotations

from datetime import date, datetime, timezone

from app.services.analysis.pathway_costs import PATHWAY_COSTS

_ALLOWED_SOURCE_TYPES = {"official", "market_primary", "public_proxy", "derived", "manual"}
_MATURITY_CONFIDENCE = {
    "commercial": 0.8,
    "scaling": 0.65,
    "early_commercial": 0.65,
    "demonstration": 0.5,
    "incumbent": 0.7,
}

# Cadence soft-max age before a curated SAF cost band is treated as stale.
# Aligned with docs/DATA_CONTRACT_V1.md confidence band 0.30-0.49 (weak/stale).
_CADENCE_MAX_AGE_DAYS = {
    "daily": 2,
    "weekly": 10,
    "monthly": 45,
    "quarterly": 100,
    "annual": 400,
}

# Cap confidence for stale curated SAF pathway proxies (DATA_CONTRACT weak/stale band).
STALE_CONFIDENCE_CAP = 0.49

_PATHWAY_SOURCES: dict[str, dict] = {
    pathway_key: {
        "source_type": "manual",
        "confidence_score": _MATURITY_CONFIDENCE[pathway.maturity_level],
        "cadence": "quarterly",
        "updated_at": "2026-04-23",
        "fallback_used": False,
    }
    for pathway_key, pathway in PATHWAY_COSTS.items()
}


def _parse_updated_at(raw: str) -> date:
    text = raw.strip()
    if "T" in text:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    return date.fromisoformat(text)


def _reference_date(as_of: date | datetime | None) -> date:
    if as_of is None:
        return datetime.now(timezone.utc).date()
    if isinstance(as_of, datetime):
        if as_of.tzinfo is None:
            return as_of.date()
        return as_of.astimezone(timezone.utc).date()
    return as_of


def is_pathway_source_stale(
    updated_at: str,
    cadence: str,
    *,
    as_of: date | datetime | None = None,
) -> bool:
    """Return True when a curated SAF pathway proxy is past its cadence window."""
    max_age = _CADENCE_MAX_AGE_DAYS.get(cadence.strip().lower())
    if max_age is None:
        return False
    age_days = (_reference_date(as_of) - _parse_updated_at(updated_at)).days
    return age_days > max_age


def _apply_fallback_semantics(
    source: dict,
    *,
    as_of: date | datetime | None = None,
) -> dict:
    """Label stale/unavailable curated SAF proxies per DATA_CONTRACT confidence bands."""
    labelled = dict(source)
    if is_pathway_source_stale(
        str(labelled["updated_at"]),
        str(labelled["cadence"]),
        as_of=as_of,
    ):
        labelled["fallback_used"] = True
        labelled["confidence_score"] = min(
            float(labelled["confidence_score"]),
            STALE_CONFIDENCE_CAP,
        )
    return labelled


def get_pathway_source(
    pathway_key: str,
    *,
    as_of: date | datetime | None = None,
) -> dict:
    normalized_key = pathway_key.strip().lower()
    if normalized_key not in _PATHWAY_SOURCES:
        raise KeyError(pathway_key)

    source = _PATHWAY_SOURCES[normalized_key]
    if source["source_type"] not in _ALLOWED_SOURCE_TYPES:
        raise ValueError(f"Invalid source type for {normalized_key}")
    return _apply_fallback_semantics(source, as_of=as_of)


def list_pathway_sources(*, as_of: date | datetime | None = None) -> dict[str, dict]:
    return {
        key: _apply_fallback_semantics(value, as_of=as_of)
        for key, value in _PATHWAY_SOURCES.items()
    }
