from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.tables import RouteCatalog
from app.schemas.pathways import PathwaySummary, PathwayUpsert
from app.security import require_admin_token

router = APIRouter()

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
