from app.schemas.analysis import BreakevenStatus, TippingPointAssessment
from app.services.analysis.pathway_costs import get_pathway_cost

EUR_TO_USD = 1.08
FOSSIL_JET_EMISSIONS_KG_PER_L = 2.5


def _carbon_credit_usd_per_l(carbon_price_eur_per_t: float, carbon_reduction_pct: float) -> float:
    carbon_price_usd_per_t = carbon_price_eur_per_t * EUR_TO_USD
    avoided_tons_per_l = (FOSSIL_JET_EMISSIONS_KG_PER_L / 1000.0) * (carbon_reduction_pct / 100.0)
    return carbon_price_usd_per_t * avoided_tons_per_l


def _status_for_spread(spread_pct: float) -> BreakevenStatus:
    if spread_pct > 25:
        return "uneconomic"
    if spread_pct > 5:
        return "inflection"
    if spread_pct >= -10:
        return "marginal_switch"
    return "dominant"


def compute_tipping_point(
    fossil_jet_usd_per_l: float,
    carbon_price_eur_per_t: float,
    subsidy_usd_per_l: float,
    blend_rate_pct: float,
    pathway_key: str = "hefa",
) -> TippingPointAssessment:
    pathway = get_pathway_cost(pathway_key)
    carbon_credit = _carbon_credit_usd_per_l(carbon_price_eur_per_t, pathway.carbon_reduction_pct)
    effective_support = (subsidy_usd_per_l + carbon_credit) * (blend_rate_pct / 100.0)
    net_saf_cost = pathway.midpoint_usd_per_l - effective_support
    spread_usd_per_l = net_saf_cost - fossil_jet_usd_per_l
    spread_pct = (spread_usd_per_l / fossil_jet_usd_per_l) * 100.0
    return TippingPointAssessment(
        pathway=pathway,
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        subsidy_usd_per_l=subsidy_usd_per_l,
        blend_rate_pct=blend_rate_pct,
        carbon_credit_usd_per_l=carbon_credit,
        effective_support_usd_per_l=effective_support,
        net_saf_cost_usd_per_l=net_saf_cost,
        net_cost_spread_usd_per_l=spread_usd_per_l,
        spread_pct=spread_pct,
        status=_status_for_spread(spread_pct),
    )
