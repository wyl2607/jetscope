from app.schemas.analysis import PathwayCostBand


PATHWAY_COSTS: dict[str, PathwayCostBand] = {
    "hefa": PathwayCostBand(
        pathway_key="hefa",
        name="HEFA",
        min_usd_per_l=1.0,
        max_usd_per_l=1.5,
        midpoint_usd_per_l=1.25,
        carbon_reduction_pct=70.0,
        maturity_level="commercial",
    ),
    "atj": PathwayCostBand(
        pathway_key="atj",
        name="ATJ",
        min_usd_per_l=1.3,
        max_usd_per_l=1.7,
        midpoint_usd_per_l=1.5,
        carbon_reduction_pct=65.0,
        maturity_level="early_commercial",
    ),
    "ft": PathwayCostBand(
        pathway_key="ft",
        name="Fischer-Tropsch",
        min_usd_per_l=1.5,
        max_usd_per_l=2.3,
        midpoint_usd_per_l=1.9,
        carbon_reduction_pct=80.0,
        maturity_level="scaling",
    ),
    "ptl": PathwayCostBand(
        pathway_key="ptl",
        name="Power-to-Liquid",
        min_usd_per_l=3.0,
        max_usd_per_l=5.0,
        midpoint_usd_per_l=4.0,
        carbon_reduction_pct=95.0,
        maturity_level="demonstration",
    ),
    "fossil_jet_crisis": PathwayCostBand(
        pathway_key="fossil_jet_crisis",
        name="Fossil Jet (Crisis Range)",
        min_usd_per_l=1.1,
        max_usd_per_l=1.5,
        midpoint_usd_per_l=1.3,
        carbon_reduction_pct=0.0,
        maturity_level="incumbent",
    ),
}


DEFAULT_ANALYSIS_PATHWAY_KEY = "hefa"


def list_pathway_costs() -> list[PathwayCostBand]:
    return list(PATHWAY_COSTS.values())


def get_pathway_cost(pathway_key: str) -> PathwayCostBand:
    normalized_key = pathway_key.strip().lower()
    if normalized_key not in PATHWAY_COSTS:
        raise KeyError(pathway_key)
    return PATHWAY_COSTS[normalized_key]
