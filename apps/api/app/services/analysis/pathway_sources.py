from app.services.analysis.pathway_costs import PATHWAY_COSTS

_ALLOWED_SOURCE_TYPES = {"official", "market_primary", "public_proxy", "derived", "manual"}
_MATURITY_CONFIDENCE = {
    "commercial": 0.8,
    "scaling": 0.65,
    "early_commercial": 0.65,
    "demonstration": 0.5,
    "incumbent": 0.7,
}

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


def get_pathway_source(pathway_key: str) -> dict:
    normalized_key = pathway_key.strip().lower()
    if normalized_key not in _PATHWAY_SOURCES:
        raise KeyError(pathway_key)

    source = _PATHWAY_SOURCES[normalized_key]
    if source["source_type"] not in _ALLOWED_SOURCE_TYPES:
        raise ValueError(f"Invalid source type for {normalized_key}")
    return dict(source)


def list_pathway_sources() -> dict[str, dict]:
    return {key: dict(value) for key, value in _PATHWAY_SOURCES.items()}
