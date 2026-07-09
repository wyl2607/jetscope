from app.schemas.analysis import BreakevenStatus, TippingPointAssessment
from app.services.analysis.crossover import (
    SpreadThresholds,
    classify_spread,
    compute_crossover,
)
from app.services.analysis.pathway_costs import (
    EUR_TO_USD,
    FOSSIL_JET_EMISSIONS_KG_PER_L,
    carbon_credit_usd_per_l,
    effective_saf_cost,
    get_pathway_cost,
)

SAF_SPREAD_THRESHOLDS = SpreadThresholds(high=25.0, mid=5.0, low=-10.0)
SAF_STATUS_LABELS: tuple[str, str, str, str] = (
    "uneconomic",
    "inflection",
    "marginal_switch",
    "dominant",
)


def _status_for_spread(spread_pct: float) -> BreakevenStatus:
    return classify_spread(spread_pct, SAF_SPREAD_THRESHOLDS, SAF_STATUS_LABELS)  # type: ignore[return-value]


def compute_tipping_point(
    fossil_jet_usd_per_l: float,
    carbon_price_eur_per_t: float,
    subsidy_usd_per_l: float,
    blend_rate_pct: float,
    pathway_key: str = "hefa",
) -> TippingPointAssessment:
    pathway = get_pathway_cost(pathway_key)
    carbon_credit = carbon_credit_usd_per_l(carbon_price_eur_per_t, pathway.carbon_reduction_pct)
    effective_support = (subsidy_usd_per_l + carbon_credit) * (blend_rate_pct / 100.0)
    net_saf_cost = effective_saf_cost(
        pathway_key,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        subsidy_usd_per_l=subsidy_usd_per_l,
        blend_rate_pct=blend_rate_pct,
    )
    crossover = compute_crossover(
        clean_cost=net_saf_cost,
        reference_cost=fossil_jet_usd_per_l,
        thresholds=SAF_SPREAD_THRESHOLDS,
        labels=SAF_STATUS_LABELS,
    )
    return TippingPointAssessment(
        pathway=pathway,
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        subsidy_usd_per_l=subsidy_usd_per_l,
        blend_rate_pct=blend_rate_pct,
        carbon_credit_usd_per_l=carbon_credit,
        effective_support_usd_per_l=effective_support,
        net_saf_cost_usd_per_l=net_saf_cost,
        net_cost_spread_usd_per_l=crossover.gap,
        spread_pct=crossover.spread_pct,
        status=crossover.status,  # type: ignore[arg-type]
    )


def compute_breakeven_oil_price(
    *,
    saf_effective_usd_per_l: float,
    jet_proxy_slope: float,
    jet_proxy_intercept: float,
) -> float:
    if jet_proxy_slope <= 0:
        raise ValueError("jet_proxy_slope must be > 0")
    return max(0.0, (saf_effective_usd_per_l - jet_proxy_intercept) / jet_proxy_slope)
