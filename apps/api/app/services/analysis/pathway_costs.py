import json
import math

from app.schemas.analysis import PathwayCostBand
from app.services.curated_events import curated_dir

# Seed FX must match market.DEFAULT_EUR_USD (ECB eurofxref baseline).
# Live market paths refresh via market.py adapters; this is analysis fallback only.
EUR_TO_USD = 1.1435
EUR_TO_USD_AS_OF = "2026-07-17"
EUR_TO_USD_SOURCE = "ECB eurofxref daily (seed aligned with market.DEFAULT_EUR_USD)"
FOSSIL_JET_EMISSIONS_KG_PER_L = 2.5

# Jet reference density 0.8 kg/L, the same one the Rotterdam USD/t conversion uses.
JET_LITRES_PER_TONNE = 1250.0

# SAF production-cost bands come from EASA's 2025 reference prices
# (data/curated/market/easa_reference_prices.json). EASA does not split
# advanced aviation biofuels by technology, so ATJ and FT share one band, and
# HEFA has a single production-cost point (its buyer price is the market index).
EASA_REFERENCE_FILE = "easa_reference_prices.json"
_PATHWAY_PROFILE = {
    "hefa": ("HEFA", 70.0, "commercial"),
    "atj": ("ATJ", 65.0, "early_commercial"),
    "ft": ("Fischer-Tropsch", 80.0, "scaling"),
    "ptl": ("Power-to-Liquid", 95.0, "demonstration"),
}


def load_easa_reference_prices() -> dict:
    with (curated_dir() / "market" / EASA_REFERENCE_FILE).open(encoding="utf-8") as handle:
        return json.load(handle)


def eur_per_t_to_usd_per_l(eur_per_t: float) -> float:
    return eur_per_t / JET_LITRES_PER_TONNE * EUR_TO_USD


def _easa_bands() -> dict[str, PathwayCostBand]:
    reference = load_easa_reference_prices()
    bands: dict[str, PathwayCostBand] = {}
    for pathway_key, (name, carbon_reduction_pct, maturity_level) in _PATHWAY_PROFILE.items():
        subcategory = reference["subcategories"][reference["pathway_production_cost"][pathway_key]]
        average = subcategory["production_cost_eur_per_t"]
        bands[pathway_key] = PathwayCostBand(
            pathway_key=pathway_key,
            name=name,
            min_usd_per_l=round(eur_per_t_to_usd_per_l(subcategory.get("low_eur_per_t", average)), 4),
            max_usd_per_l=round(eur_per_t_to_usd_per_l(subcategory.get("high_eur_per_t", average)), 4),
            midpoint_usd_per_l=round(eur_per_t_to_usd_per_l(average), 4),
            carbon_reduction_pct=carbon_reduction_pct,
            maturity_level=maturity_level,
        )
    return bands


PATHWAY_COSTS: dict[str, PathwayCostBand] = {
    **_easa_bands(),
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


def carbon_credit_usd_per_l(carbon_price_eur_per_t: float) -> float:
    """EU ETS value of one litre of SAF instead of fossil jet.

    Eligible SAF is zero-rated under the EU ETS, so each litre avoids the
    allowances for the full combustion factor. The pathway's lifecycle
    reduction (carbon_reduction_pct) is an LCA figure and carries no ETS value.
    """
    return carbon_price_eur_per_t * EUR_TO_USD * (FOSSIL_JET_EMISSIONS_KG_PER_L / 1000.0)


def effective_saf_cost(
    pathway_key: str,
    *,
    carbon_price_eur_per_t: float = 0.0,
    subsidy_usd_per_l: float = 0.0,
    blend_rate_pct: float = 100.0,
) -> float:
    pathway = get_pathway_cost(pathway_key)
    carbon_credit = carbon_credit_usd_per_l(carbon_price_eur_per_t)
    effective_support = (subsidy_usd_per_l + carbon_credit) * (blend_rate_pct / 100.0)
    return pathway.midpoint_usd_per_l - effective_support


def _ensure_finite(value: float, *, label: str) -> None:
    if not math.isfinite(value):
        raise ValueError(f"{label} must be finite")


def compare_pathways(
    *,
    fossil_jet_usd_per_l: float,
    carbon_price_eur_per_t: float = 0.0,
    subsidy_usd_per_l: float = 0.0,
    blend_rate_pct: float = 100.0,
) -> list[dict]:
    comparisons: list[dict] = []

    for pathway_key, pathway in PATHWAY_COSTS.items():
        if pathway_key == "fossil_jet_crisis":
            continue

        effective_cost = effective_saf_cost(
            pathway_key,
            carbon_price_eur_per_t=carbon_price_eur_per_t,
            subsidy_usd_per_l=subsidy_usd_per_l,
            blend_rate_pct=blend_rate_pct,
        )
        gap_vs_fossil = effective_cost - fossil_jet_usd_per_l
        spread_pct: float | None
        if fossil_jet_usd_per_l <= 0:
            spread_pct = None
        else:
            spread_pct = (gap_vs_fossil / fossil_jet_usd_per_l) * 100.0

        _ensure_finite(effective_cost, label="effective_saf_cost_usd_per_l")
        _ensure_finite(gap_vs_fossil, label="gap_vs_fossil_usd_per_l")
        if spread_pct is not None:
            _ensure_finite(spread_pct, label="spread_pct")

        if fossil_jet_usd_per_l <= 0 or spread_pct is None:
            status = "not_computable"
        elif effective_cost < fossil_jet_usd_per_l:
            status = "below_fossil"
        elif spread_pct <= 5:
            status = "competitive"
        elif spread_pct <= 25:
            status = "inflection"
        else:
            status = "premium"

        comparisons.append(
            {
                "pathway_key": pathway.pathway_key,
                "name": pathway.name,
                "min_usd_per_l": pathway.min_usd_per_l,
                "max_usd_per_l": pathway.max_usd_per_l,
                "midpoint_usd_per_l": pathway.midpoint_usd_per_l,
                "carbon_reduction_pct": pathway.carbon_reduction_pct,
                "maturity_level": pathway.maturity_level,
                "effective_saf_cost_usd_per_l": effective_cost,
                "gap_vs_fossil_usd_per_l": gap_vs_fossil,
                "spread_pct": spread_pct,
                "status": status,
            }
        )

    return comparisons


def carbon_price_sweep(
    *,
    fossil_jet_usd_per_l: float,
    carbon_min: float,
    carbon_max: float,
    step: float,
    subsidy_usd_per_l: float = 0.0,
    blend_rate_pct: float = 100.0,
) -> list[dict]:
    if step <= 0:
        raise ValueError("step must be > 0")
    if carbon_max < carbon_min:
        raise ValueError("carbon_max must be >= carbon_min")

    sweep_points: list[dict] = []
    carbon_price = carbon_min

    while carbon_price <= carbon_max:
        pathways = []
        for pathway_key in PATHWAY_COSTS:
            if pathway_key == "fossil_jet_crisis":
                continue

            effective_cost = effective_saf_cost(
                pathway_key,
                carbon_price_eur_per_t=carbon_price,
                subsidy_usd_per_l=subsidy_usd_per_l,
                blend_rate_pct=blend_rate_pct,
            )
            _ensure_finite(effective_cost, label="effective_saf_cost_usd_per_l")
            _ensure_finite(effective_cost - fossil_jet_usd_per_l, label="gap_vs_fossil_usd_per_l")

            if fossil_jet_usd_per_l > 0:
                spread_pct = ((effective_cost - fossil_jet_usd_per_l) / fossil_jet_usd_per_l) * 100.0
                _ensure_finite(spread_pct, label="spread_pct")

            pathways.append(
                {
                    "pathway_key": pathway_key,
                    "effective_saf_cost_usd_per_l": effective_cost,
                }
            )

        sweep_points.append(
            {
                "carbon_price_eur_per_t": carbon_price,
                "pathways": pathways,
            }
        )
        carbon_price += step

    return sweep_points
