from fastapi import APIRouter, HTTPException, Query

from app.schemas.analysis import AirlineDecisionResponse, TippingPointResponse
from app.services.analysis.dashboard_contracts import (
    build_airline_decision_response,
    build_tipping_point_response,
)
from app.services.analysis.pathway_costs import DEFAULT_ANALYSIS_PATHWAY_KEY, get_pathway_cost

router = APIRouter()


@router.get("/tipping-point", response_model=TippingPointResponse)
def get_tipping_point_analysis(
    fossil_jet_usd_per_l: float = Query(..., gt=0, description="Current fossil jet fuel price in USD/L"),
    carbon_price_eur_per_t: float = Query(0.0, ge=0, description="Carbon price in EUR per metric ton"),
    subsidy_usd_per_l: float = Query(0.0, ge=0, description="Per-liter SAF subsidy in USD"),
    blend_rate_pct: float = Query(0.0, ge=0, le=100, description="Blend rate as percent of total fuel burn"),
) -> TippingPointResponse:
    return build_tipping_point_response(
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        subsidy_usd_per_l=subsidy_usd_per_l,
        blend_rate_pct=blend_rate_pct,
    )


@router.get("/airline-decision", response_model=AirlineDecisionResponse)
def get_airline_decision_analysis(
    fossil_jet_usd_per_l: float = Query(..., gt=0, description="Current fossil jet fuel price in USD/L"),
    reserve_weeks: float = Query(..., gt=0, description="Estimated reserve coverage in weeks"),
    carbon_price_eur_per_t: float = Query(0.0, ge=0, description="Carbon price in EUR per metric ton"),
    pathway_key: str = Query(DEFAULT_ANALYSIS_PATHWAY_KEY, description="SAF pathway key"),
    fare_pass_through_pct: float | None = Query(
        None,
        ge=0,
        le=1,
        description="Optional observed fare pass-through share (e.g. 0.60 from Lufthansa Q2 2026 article)",
    ),
    labor_cost_impact_eur_m: float | None = Query(
        None,
        ge=0,
        description="Optional labor/strike cost impact in EUR millions (e.g. 150 from Lufthansa Q2 2026)",
    ),
    extra_fuel_cost_eur_m: float | None = Query(
        None,
        ge=0,
        description="Optional extra fuel cost in EUR millions (e.g. 750 from Lufthansa Q2 2026); stored as context only",
    ),
) -> AirlineDecisionResponse:
    try:
        get_pathway_cost(pathway_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown pathway_key: {pathway_key}") from exc

    return build_airline_decision_response(
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        reserve_weeks=reserve_weeks,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        pathway_key=pathway_key,
        fare_pass_through_pct=fare_pass_through_pct,
        labor_cost_impact_eur_m=labor_cost_impact_eur_m,
        extra_fuel_cost_eur_m=extra_fuel_cost_eur_m,
    )
