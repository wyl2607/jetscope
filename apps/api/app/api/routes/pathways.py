from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.tables import RouteCatalog
from app.schemas.analysis import PathwayComparisonResponse
from app.schemas.pathways import PathwaySummary, PathwayUpsert
from app.security import require_admin_token
from app.services.analysis.dashboard_contracts import build_pathway_comparison_response

router = APIRouter()

_CARBON_SWEEP_MAX_CEILING = 1000.0
_CARBON_SWEEP_MAX_POINTS = 101


@router.get("/compare", response_model=PathwayComparisonResponse)
def compare_pathways_endpoint(
    fossil_jet_usd_per_l: float = Query(..., gt=0, description="Current fossil jet fuel price in USD/L"),
    carbon_price_eur_per_t: float = Query(0.0, ge=0, description="Carbon price in EUR per metric ton"),
    subsidy_usd_per_l: float = Query(0.0, ge=0, description="Per-liter SAF subsidy in USD"),
    blend_rate_pct: float = Query(0.0, ge=0, le=100, description="Blend rate as percent of total fuel burn"),
    carbon_sweep_min: float = Query(0.0, ge=0, description="Carbon-price sweep lower bound (EUR/t)"),
    carbon_sweep_max: float | None = Query(
        None, ge=0, description="Carbon-price sweep upper bound (EUR/t); omit to skip the sweep"
    ),
    carbon_sweep_step: float = Query(10.0, gt=0, description="Carbon-price sweep step (EUR/t)"),
) -> PathwayComparisonResponse:
    if carbon_sweep_max is not None:
        if carbon_sweep_max > _CARBON_SWEEP_MAX_CEILING:
            raise HTTPException(status_code=422, detail="carbon_sweep_max exceeds the 1000 EUR/t ceiling")
        if carbon_sweep_max < carbon_sweep_min:
            raise HTTPException(status_code=422, detail="carbon_sweep_max must be >= carbon_sweep_min")
        points = int((carbon_sweep_max - carbon_sweep_min) / carbon_sweep_step) + 1
        if points > _CARBON_SWEEP_MAX_POINTS:
            raise HTTPException(status_code=422, detail="carbon sweep resolution exceeds 101 points")

    try:
        return build_pathway_comparison_response(
            fossil_jet_usd_per_l=fossil_jet_usd_per_l,
            carbon_price_eur_per_t=carbon_price_eur_per_t,
            subsidy_usd_per_l=subsidy_usd_per_l,
            blend_rate_pct=blend_rate_pct,
            carbon_sweep_min=carbon_sweep_min,
            carbon_sweep_max=carbon_sweep_max,
            carbon_sweep_step=carbon_sweep_step,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

DEFAULT_PATHWAYS = [
    {
        "pathway_id": "sugar-atj",
        "name": "Sugar ATJ-SPK",
        "pathway": "Sugar -> Ethanol -> Jet",
        "base_cost_usd_per_l": 1.6,
        "co2_savings_kg_per_l": 1.5,
        "category": "saf",
    },
    {
        "pathway_id": "reed-hefa",
        "name": "Reed HEFA",
        "pathway": "Reed / Carinata -> HEFA",
        "base_cost_usd_per_l": 1.85,
        "co2_savings_kg_per_l": 1.8,
        "category": "saf",
    },
    {
        "pathway_id": "ptl-esaf",
        "name": "PtL e-SAF",
        "pathway": "CO2 + H2 -> FT",
        "base_cost_usd_per_l": 4.5,
        "co2_savings_kg_per_l": 2.4,
        "category": "saf",
    },
]


def _seed_pathways_if_needed(db: Session) -> None:
    existing = db.scalar(select(RouteCatalog.pathway_id).limit(1))
    if existing is not None:
        return
    for row in DEFAULT_PATHWAYS:
        db.add(RouteCatalog(**row))
    db.commit()


def _list_pathway_rows(db: Session) -> list[RouteCatalog]:
    _seed_pathways_if_needed(db)
    return db.scalars(select(RouteCatalog).order_by(RouteCatalog.base_cost_usd_per_l.asc())).all()


@router.get("", response_model=list[PathwaySummary])
def list_pathways(db: Session = Depends(get_db)) -> list[PathwaySummary]:
    rows = _list_pathway_rows(db)
    return [
        PathwaySummary(
            pathway_id=row.pathway_id,
            name=row.name,
            base_cost_usd_per_l=row.base_cost_usd_per_l,
            co2_savings_kg_per_l=row.co2_savings_kg_per_l,
        )
        for row in rows
    ]


@router.put("", response_model=list[PathwaySummary])
def upsert_pathways(
    payload: list[PathwayUpsert],
    _auth: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> list[PathwaySummary]:
    for item in payload:
        row = db.scalar(select(RouteCatalog).where(RouteCatalog.pathway_id == item.pathway_id))
        if row is None:
            row = RouteCatalog(
                pathway_id=item.pathway_id,
                name=item.name,
                pathway=item.pathway,
                base_cost_usd_per_l=item.base_cost_usd_per_l,
                co2_savings_kg_per_l=item.co2_savings_kg_per_l,
                category=item.category,
            )
            db.add(row)
        else:
            row.name = item.name
            row.pathway = item.pathway
            row.base_cost_usd_per_l = item.base_cost_usd_per_l
            row.co2_savings_kg_per_l = item.co2_savings_kg_per_l
            row.category = item.category
    db.commit()
    return list_pathways(db)
