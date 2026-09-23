from app.schemas.analysis import (
    AirlineDecisionAssessment,
    AirlineDecisionInputs,
    AirlineDecisionResponse,
    PathwayTippingPoint,
    SafAllowanceBasis,
    SafMarketCheck,
    TippingPointAssessment,
    TippingPointInputs,
    TippingPointResponse,
)
from app.schemas.reserves import ReserveSignalResponse
from app.services.analysis.breakeven import EUR_TO_USD, FOSSIL_JET_EMISSIONS_KG_PER_L, compute_tipping_point
from app.services.analysis.pathway_costs import carbon_credit_usd_per_l
from app.services.analysis.saf_allowance import (
    SafAllowanceMode,
    allowance_support_usd_per_l,
    coverage_pct,
    load_saf_allowance_rules,
)
from app.services.analysis.saf_market import MARKET_REFERENCE_PATHWAY, latest_saf_market_reference
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


def _status_with_allowance(fossil: float, low: float, high: float, high_end_support: float) -> str:
    # An allowance only closes part or all of a gap; parity it creates is not a cost advantage.
    status = _pathway_status(fossil, low, high)
    return "inflection" if status == "competitive" and high_end_support > 0 else status


def _pathway_row(
    assessment: TippingPointAssessment,
    *,
    effective_fossil_jet_usd_per_l: float,
    allowance_rules: dict | None = None,
    allowance_mode: SafAllowanceMode = "none",
) -> PathwayTippingPoint:
    pathway = assessment.pathway
    net_low_usd_per_l = max(0.0001, pathway.min_usd_per_l - assessment.effective_support_usd_per_l)
    net_high_usd_per_l = max(net_low_usd_per_l, pathway.max_usd_per_l - assessment.effective_support_usd_per_l)
    allowance_pct = coverage_pct(allowance_rules, allowance_mode, pathway.pathway_key)
    net_low_usd_per_l -= allowance_support_usd_per_l(net_low_usd_per_l, effective_fossil_jet_usd_per_l, allowance_pct)
    high_end_support = allowance_support_usd_per_l(net_high_usd_per_l, effective_fossil_jet_usd_per_l, allowance_pct)
    net_high_usd_per_l -= high_end_support
    spread_low_pct = ((net_low_usd_per_l - effective_fossil_jet_usd_per_l) / effective_fossil_jet_usd_per_l) * 100.0
    spread_high_pct = ((net_high_usd_per_l - effective_fossil_jet_usd_per_l) / effective_fossil_jet_usd_per_l) * 100.0
    return PathwayTippingPoint(
        pathway_key=pathway.pathway_key,
        display_name=pathway.name,
        net_cost_low_usd_per_l=round(net_low_usd_per_l, 4),
        net_cost_high_usd_per_l=round(net_high_usd_per_l, 4),
        spread_low_pct=round(spread_low_pct, 2),
        spread_high_pct=round(spread_high_pct, 2),
        status=_status_with_allowance(
            effective_fossil_jet_usd_per_l, net_low_usd_per_l, net_high_usd_per_l, high_end_support
        ),
        allowance_coverage_pct=allowance_pct,
        allowance_category_assumed=bool(
            allowance_mode == "statutory"
            and (allowance_rules or {}).get("pathway_categories", {}).get(pathway.pathway_key, {}).get("assumption")
        ),
    )


def _premium_pct(saf_usd_per_l: float, fossil_usd_per_l: float) -> float:
    return round((saf_usd_per_l - fossil_usd_per_l) / fossil_usd_per_l * 100.0, 2)


def _saf_market_check(
    fossil_jet_usd_per_l: float,
    carbon_price_eur_per_t: float,
    allowance_rules: dict | None = None,
    allowance_mode: SafAllowanceMode = "none",
) -> SafMarketCheck | None:
    reference = latest_saf_market_reference()
    if reference is None:
        return None
    # Per litre, independent of blend: SAF is zero-rated, fossil jet carries its ETS cost.
    fossil_with_ets = fossil_jet_usd_per_l + carbon_credit_usd_per_l(carbon_price_eur_per_t)
    # The allowance covers a share of the gap left after that carbon incentive.
    allowance_pct = coverage_pct(allowance_rules, allowance_mode, MARKET_REFERENCE_PATHWAY)
    support = allowance_support_usd_per_l(reference.saf_usd_per_l, fossil_with_ets, allowance_pct)
    saf_usd_per_l = reference.saf_usd_per_l - support
    statutory_pct = coverage_pct(allowance_rules, "statutory", MARKET_REFERENCE_PATHWAY) if allowance_rules else None
    statutory_premium = (
        _premium_pct(
            reference.saf_usd_per_l
            - allowance_support_usd_per_l(reference.saf_usd_per_l, fossil_with_ets, statutory_pct),
            fossil_with_ets,
        )
        if statutory_pct is not None
        else None
    )
    return SafMarketCheck(
        reference_id=reference.reference_id,
        kind=reference.kind,
        region=reference.region,
        period=reference.period,
        published_at=reference.published_at,
        source_name=reference.source_name,
        source_url=reference.source_url,
        pathway_key=MARKET_REFERENCE_PATHWAY,
        saf_eur_per_t=reference.saf_eur_per_t,
        saf_usd_per_l=round(reference.saf_usd_per_l, 4),
        fossil_with_ets_usd_per_l=round(fossil_with_ets, 4),
        premium_pct=_premium_pct(saf_usd_per_l, fossil_with_ets),
        status=_status_with_allowance(fossil_with_ets, saf_usd_per_l, saf_usd_per_l, support),
        allowance_coverage_pct=allowance_pct,
        allowance_support_usd_per_l=round(support, 4),
        statutory_allowance_coverage_pct=statutory_pct,
        statutory_allowance_premium_pct=statutory_premium,
    )


def _saf_allowance_basis(rules: dict | None) -> SafAllowanceBasis | None:
    if rules is None:
        return None
    legal, latest = rules["legal_basis"], rules["latest_allocation"]
    return SafAllowanceBasis(
        legal_basis_name=legal["name"],
        legal_basis_url=legal["url"],
        period=legal["period"],
        reserve_allowances=legal["reserve_allowances"],
        rates_pct=rules["rates_pct"],
        latest_fuel_year=latest["fuel_year"],
        latest_published_at=latest["published_at"],
        latest_allowances=latest["allowances"],
        latest_value_eur=latest["value_eur"],
        latest_saf_tonnes=latest["saf_tonnes"],
        latest_source_name=latest["source_name"],
        latest_source_url=latest["source_url"],
    )


def build_tipping_point_response(
    *,
    fossil_jet_usd_per_l: float,
    carbon_price_eur_per_t: float,
    subsidy_usd_per_l: float,
    blend_rate_pct: float,
    saf_allowance: SafAllowanceMode = "none",
) -> TippingPointResponse:
    effective_fossil = _effective_fossil_jet_usd_per_l(fossil_jet_usd_per_l, carbon_price_eur_per_t, blend_rate_pct)
    allowance_rules = load_saf_allowance_rules()
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
            allowance_rules=allowance_rules,
            allowance_mode=saf_allowance,
        )
        for pathway_key in pathway_keys
    ]

    market_check = _saf_market_check(fossil_jet_usd_per_l, carbon_price_eur_per_t, allowance_rules, saf_allowance)
    if market_check is not None:
        # What airlines actually pay decides the headline; production-cost bands
        # stay in `pathways` as the investment view.
        statuses = [market_check.status]
        signal_basis = "market_reference"
    else:
        statuses = [pathway.status for pathway in pathways]
        signal_basis = "production_cost"
    if "competitive" in statuses:
        signal = "saf_cost_advantaged"
    elif "inflection" in statuses:
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
            saf_allowance=saf_allowance,
        ),
        effective_fossil_jet_usd_per_l=round(effective_fossil, 4),
        pathways=pathways,
        market_check=market_check,
        saf_allowance=_saf_allowance_basis(allowance_rules),
        signal=signal,
        signal_basis=signal_basis,
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
    fare_pass_through_pct: float | None = None,
    labor_cost_impact_eur_m: float | None = None,
    extra_fuel_cost_eur_m: float | None = None,
) -> AirlineDecisionResponse:
    get_pathway_cost(pathway_key)
    assessment = compute_airline_decision(
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        reserve_weeks=reserve_weeks,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        pathway_key=pathway_key,
        fare_pass_through_pct=fare_pass_through_pct,
        labor_cost_impact_eur_m=labor_cost_impact_eur_m,
        extra_fuel_cost_eur_m=extra_fuel_cost_eur_m,
    )
    return AirlineDecisionResponse(
        generated_at=utcnow(),
        inputs=AirlineDecisionInputs(
            fossil_jet_usd_per_l=fossil_jet_usd_per_l,
            reserve_weeks=reserve_weeks,
            carbon_price_eur_per_t=carbon_price_eur_per_t,
            pathway_key=pathway_key,
            fare_pass_through_pct=fare_pass_through_pct,
            labor_cost_impact_eur_m=labor_cost_impact_eur_m,
            extra_fuel_cost_eur_m=extra_fuel_cost_eur_m,
        ),
        probabilities=assessment.probabilities,
        signal=_decision_signal(assessment),
        fare_pass_through_pct=assessment.fare_pass_through_pct,
        labor_cost_impact_eur_m=assessment.labor_cost_impact_eur_m,
        extra_fuel_cost_eur_m=assessment.extra_fuel_cost_eur_m,
        residual_fuel_cost_exposure=assessment.residual_fuel_cost_exposure,
    )


def _reserve_source_name(source_type: str) -> str:
    if source_type == "manual":
        return "JetScope curated / env override (not IATA/EUROCONTROL live feed)"
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


def build_pathway_comparison_response(
    *,
    fossil_jet_usd_per_l: float,
    carbon_price_eur_per_t: float = 0.0,
    subsidy_usd_per_l: float = 0.0,
    blend_rate_pct: float = 0.0,
    carbon_sweep_min: float = 0.0,
    carbon_sweep_max: float | None = None,
    carbon_sweep_step: float = 10.0,
):
    """Build the SAF pathway comparison contract.

    ``signal`` is rule-based and deterministic over the computable rows
    (status != ``not_computable``):
    - ``insufficient_data``: no computable row.
    - ``clear_leader``: best row is ``below_fossil`` OR best spread_pct <= 5 and
      leads the runner-up by >= 10 spread points.
    - ``close_race``: best spread_pct <= 25 and not a clear leader.
    - ``no_advantage``: otherwise.
    """
    from app.schemas.analysis import (
        PathwayCarbonSweepEntry,
        PathwayCarbonSweepPoint,
        PathwayComparisonInputs,
        PathwayComparisonResponse,
        PathwayComparisonRow,
        PathwaySourceMeta,
    )
    from app.services.analysis.pathway_costs import carbon_price_sweep, compare_pathways
    from app.services.analysis.pathway_sources import get_pathway_source

    raw_rows = compare_pathways(
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        subsidy_usd_per_l=subsidy_usd_per_l,
        blend_rate_pct=blend_rate_pct,
    )
    rows = [
        PathwayComparisonRow(source=PathwaySourceMeta(**get_pathway_source(row["pathway_key"])), **row)
        for row in raw_rows
    ]

    sweep: list = []
    if carbon_sweep_max is not None:
        for point in carbon_price_sweep(
            fossil_jet_usd_per_l=fossil_jet_usd_per_l,
            carbon_min=carbon_sweep_min,
            carbon_max=carbon_sweep_max,
            step=carbon_sweep_step,
            subsidy_usd_per_l=subsidy_usd_per_l,
            blend_rate_pct=blend_rate_pct,
        ):
            sweep.append(
                PathwayCarbonSweepPoint(
                    carbon_price_eur_per_t=point["carbon_price_eur_per_t"],
                    pathways=[PathwayCarbonSweepEntry(**entry) for entry in point["pathways"]],
                )
            )

    signal = _pathway_comparison_signal(rows)

    return PathwayComparisonResponse(
        generated_at=utcnow(),
        inputs=PathwayComparisonInputs(
            fossil_jet_usd_per_l=fossil_jet_usd_per_l,
            carbon_price_eur_per_t=carbon_price_eur_per_t,
            subsidy_usd_per_l=subsidy_usd_per_l,
            blend_rate_pct=blend_rate_pct,
        ),
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        rows=rows,
        carbon_sweep=sweep,
        signal=signal,
    )


def _pathway_comparison_signal(rows) -> str:
    computable = [row for row in rows if row.status != "not_computable" and row.spread_pct is not None]
    if not computable:
        return "insufficient_data"
    ordered = sorted(computable, key=lambda row: row.effective_saf_cost_usd_per_l)
    best = ordered[0]
    runner_up_spread = ordered[1].spread_pct if len(ordered) > 1 else None
    leads_clearly = runner_up_spread is not None and (runner_up_spread - best.spread_pct) >= 10
    if best.status == "below_fossil" or (best.spread_pct <= 5 and leads_clearly):
        return "clear_leader"
    if best.spread_pct <= 25:
        return "close_race"
    return "no_advantage"
