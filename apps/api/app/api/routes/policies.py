from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.tables import RefuelEuTarget
from app.schemas.policies import (
    EuEtsPressureInputs,
    EuEtsPressurePoint,
    EuEtsPressureResponse,
    EuEtsPressureSource,
    PolicyTarget,
)
from app.security import require_admin_token
from app.services.analysis.policy_pressure import (
    eu_ets_pressure_curve,
    eu_ets_pressure_source,
    pressure_signal,
)

router = APIRouter()

_EU_ETS_MAX_CEILING = 1000.0
_EU_ETS_MAX_POINTS = 101


@router.get("/eu-ets-pressure", response_model=EuEtsPressureResponse)
def get_eu_ets_pressure(
    fossil_jet_usd_per_l: float = Query(..., gt=0, description="Fossil jet fuel price in USD/L"),
    exempt_blend_pct: float = Query(0.0, ge=0, le=100, description="SAF blend share exempt from EU ETS (percent)"),
    eu_ets_min: float = Query(0.0, ge=0, description="EU ETS price sweep lower bound (EUR/t)"),
    eu_ets_max: float = Query(200.0, ge=0, description="EU ETS price sweep upper bound (EUR/t)"),
    eu_ets_step: float = Query(10.0, gt=0, description="EU ETS price sweep step (EUR/t)"),
) -> EuEtsPressureResponse:
    if eu_ets_max > _EU_ETS_MAX_CEILING:
        raise HTTPException(status_code=422, detail="eu_ets_max exceeds the 1000 EUR/t ceiling")
    if eu_ets_max < eu_ets_min:
        raise HTTPException(status_code=422, detail="eu_ets_max must be >= eu_ets_min")
    points = int((eu_ets_max - eu_ets_min) / eu_ets_step) + 1
    if points > _EU_ETS_MAX_POINTS:
        raise HTTPException(status_code=422, detail="EU ETS sweep resolution exceeds 101 points")

    curve = eu_ets_pressure_curve(
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        exempt_blend_pct=exempt_blend_pct,
        eu_ets_min=eu_ets_min,
        eu_ets_max=eu_ets_max,
        eu_ets_step=eu_ets_step,
    )
    return EuEtsPressureResponse(
        generated_at=datetime.now(timezone.utc),
        inputs=EuEtsPressureInputs(
            fossil_jet_usd_per_l=fossil_jet_usd_per_l,
            exempt_blend_pct=exempt_blend_pct,
            eu_ets_min=eu_ets_min,
            eu_ets_max=eu_ets_max,
            eu_ets_step=eu_ets_step,
        ),
        points=[EuEtsPressurePoint(**point) for point in curve],
        source=EuEtsPressureSource(**eu_ets_pressure_source()),
        signal=pressure_signal(curve),
    )

DEFAULT_POLICY_TARGETS = [
    {"year": 2030, "saf_share_pct": 6, "synthetic_share_pct": 1.2, "label": "Early scale-up"},
    {"year": 2035, "saf_share_pct": 20, "synthetic_share_pct": 5, "label": "Commercial lift-off"},
    {"year": 2050, "saf_share_pct": 70, "synthetic_share_pct": 35, "label": "Long-run target"},
]


def _seed_policies_if_needed(db: Session) -> None:
    existing = db.scalar(select(RefuelEuTarget.year).limit(1))
    if existing is not None:
        return
    for row in DEFAULT_POLICY_TARGETS:
        db.add(RefuelEuTarget(**row))
    db.commit()


def _list_policy_rows(db: Session) -> list[RefuelEuTarget]:
    _seed_policies_if_needed(db)
    return db.scalars(select(RefuelEuTarget).order_by(RefuelEuTarget.year.asc())).all()


@router.get("/refuel-eu", response_model=list[PolicyTarget])
def list_refuel_eu_targets(db: Session = Depends(get_db)) -> list[PolicyTarget]:
    rows = _list_policy_rows(db)
    return [
        PolicyTarget(
            year=row.year,
            saf_share_pct=row.saf_share_pct,
            synthetic_share_pct=row.synthetic_share_pct,
            label=row.label,
        )
        for row in rows
    ]


@router.put("/refuel-eu", response_model=list[PolicyTarget])
def upsert_refuel_eu_targets(
    payload: list[PolicyTarget],
    _auth: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> list[PolicyTarget]:
    for item in payload:
        row = db.scalar(select(RefuelEuTarget).where(RefuelEuTarget.year == item.year))
        if row is None:
            row = RefuelEuTarget(
                year=item.year,
                saf_share_pct=item.saf_share_pct,
                synthetic_share_pct=item.synthetic_share_pct,
                label=item.label,
            )
            db.add(row)
        else:
            row.saf_share_pct = item.saf_share_pct
            row.synthetic_share_pct = item.synthetic_share_pct
            row.label = item.label
    db.commit()
    return list_refuel_eu_targets(db)
