from app.schemas.analysis import (
    AirlineDecisionAssessment,
    AirlineDecisionInputs,
    AirlineDecisionResponse,
    PathwayTippingPoint,
    TippingPointAssessment,
    TippingPointInputs,
    TippingPointResponse,
)
from app.schemas.reserves import ReserveSignalResponse
from app.services.analysis.breakeven import EUR_TO_USD, FOSSIL_JET_EMISSIONS_KG_PER_L, compute_tipping_point
from app.services.analysis.decision_matrix import compute_airline_decision
from app.services.analysis.pathway_costs import get_pathway_cost, list_pathway_costs
from app.services.analysis.reserve_stress import get_eu_reserve_stress
from app.services.bootstrap import utcnow

_PATHWAY_ORDER = {"hefa": 0, "atj": 1, "ft": 2, "ptl": 3}


def _effective_fossil_jet_usd_per_l(fossil_jet_usd_per_l: float, carbon_price_eur_per_t: float, blend_rate_pct: float) -> float:
    carbon_cost_usd_per_l = (carbon_price_eur_per_t * EUR_TO_USD) * (FOSSIL_JET_EMISSIONS_KG_PER_L / 1000.0)
    return fossil_jet_usd_per_l + carbon_cost_usd_per_l * (1.0 - blend_rate_pct / 100.0)


def _pathway_status(effective_fossil_jet_usd_per_l: float, net_low_usd_per_l: float, net_high_usd_per_l: float) -> str:
    if net_high_usd_per_l <= effective_fossil_jet_usd_per_l:
        return "competitive"
    if net_low_usd_per_l <= effective_fossil_jet_usd_per_l or (
        (net_low_usd_per_l - effective_fossil_jet_usd_per_l) / effective_fossil_jet_usd_per_l
    ) <= 0.15:
        return "inflection"
    return "premium"


def _pathway_row(
    assessment: TippingPointAssessment,
    *,
    effective_fossil_jet_usd_per_l: float,
) -> PathwayTippingPoint:
    pathway = assessment.pathway
    net_low_usd_per_l = max(0.0001, pathway.min_usd_per_l - assessment.effective_support_usd_per_l)
    net_high_usd_per_l = max(net_low_usd_per_l, pathway.max_usd_per_l - assessment.effective_support_usd_per_l)
    spread_low_pct = ((net_low_usd_per_l - effective_fossil_jet_usd_per_l) / effective_fossil_jet_usd_per_l) * 100.0
    spread_high_pct = ((net_high_usd_per_l - effective_fossil_jet_usd_per_l) / effective_fossil_jet_usd_per_l) * 100.0
    return PathwayTippingPoint(
        pathway_key=pathway.pathway_key,
        display_name=pathway.name,
        net_cost_low_usd_per_l=round(net_low_usd_per_l, 4),
        net_cost_high_usd_per_l=round(net_high_usd_per_l, 4),
        spread_low_pct=round(spread_low_pct, 2),
        spread_high_pct=round(spread_high_pct, 2),
        status=_pathway_status(effective_fossil_jet_usd_per_l, net_low_usd_per_l, net_high_usd_per_l),
    )


def build_tipping_point_response(
    *,
    fossil_jet_usd_per_l: float,
    carbon_price_eur_per_t: float,
    subsidy_usd_per_l: float,
    blend_rate_pct: float,
) -> TippingPointResponse:
    effective_fossil = _effective_fossil_jet_usd_per_l(fossil_jet_usd_per_l, carbon_price_eur_per_t, blend_rate_pct)
    pathway_keys = [
        pathway.pathway_key
        for pathway in sorted(list_pathway_costs(), key=lambda item: _PATHWAY_ORDER.get(item.pathway_key, 99))
        if pathway.pathway_key in _PATHWAY_ORDER
    ]
    pathways = [
        _pathway_row(
            compute_tipping_point(
                fossil_jet_usd_per_l=fossil_jet_usd_per_l,
                carbon_price_eur_per_t=carbon_price_eur_per_t,
                subsidy_usd_per_l=subsidy_usd_per_l,
                blend_rate_pct=blend_rate_pct,
                pathway_key=pathway_key,
            ),
            effective_fossil_jet_usd_per_l=effective_fossil,
        )
        for pathway_key in pathway_keys
    ]

    if any(pathway.status == "competitive" for pathway in pathways):
        signal = "saf_cost_advantaged"
    elif any(pathway.status == "inflection" for pathway in pathways):
        signal = "switch_window_opening"
    else:
        signal = "fossil_still_advantaged"

    return TippingPointResponse(
        generated_at=utcnow(),
        inputs=TippingPointInputs(
            fossil_jet_usd_per_l=fossil_jet_usd_per_l,
            carbon_price_eur_per_t=carbon_price_eur_per_t,
            subsidy_usd_per_l=subsidy_usd_per_l,
            blend_rate_pct=blend_rate_pct,
        ),
        effective_fossil_jet_usd_per_l=round(effective_fossil, 4),
        pathways=pathways,
        signal=signal,
    )


def _decision_signal(assessment: AirlineDecisionAssessment) -> str:
    dominant = assessment.dominant_response
    if dominant == "sign_long_term_offtake":
        return "switch_window_opening"
    if assessment.reserve_signal in {"critical", "elevated"} and dominant in {"cut_capacity", "ground_routes"}:
        return "capacity_stress_dominant"
    return "incremental_adjustment"


def build_airline_decision_response(
    *,
    fossil_jet_usd_per_l: float,
    reserve_weeks: float,
    carbon_price_eur_per_t: float,
    pathway_key: str,
) -> AirlineDecisionResponse:
    get_pathway_cost(pathway_key)
    assessment = compute_airline_decision(
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        reserve_weeks=reserve_weeks,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        pathway_key=pathway_key,
    )
    return AirlineDecisionResponse(
        generated_at=utcnow(),
        inputs=AirlineDecisionInputs(
            fossil_jet_usd_per_l=fossil_jet_usd_per_l,
            reserve_weeks=reserve_weeks,
            carbon_price_eur_per_t=carbon_price_eur_per_t,
            pathway_key=pathway_key,
        ),
        probabilities=assessment.probabilities,
        signal=_decision_signal(assessment),
    )


def _reserve_source_name(source_type: str) -> str:
    if source_type == "manual":
        return "IATA / EUROCONTROL curated estimate"
    if source_type == "official":
        return "IEA Oil Market Report"
    if source_type == "derived":
        return "Derived reserve coverage model"
    return source_type


def build_eu_reserve_signal_response(db=None) -> ReserveSignalResponse:
    reserve_stress = get_eu_reserve_stress(db=db)
    return ReserveSignalResponse(
        generated_at=reserve_stress.observed_at or utcnow(),
        region=reserve_stress.region,
        coverage_days=reserve_stress.coverage_days,
        coverage_weeks=round(reserve_stress.coverage_days / 7.0, 2),
        stress_level=reserve_stress.stress_level,
        estimated_supply_gap_pct=reserve_stress.supply_gap_pct,
        source_type=reserve_stress.source_type,
        source_name=_reserve_source_name(reserve_stress.source_type),
        confidence_score=reserve_stress.confidence,
    )
