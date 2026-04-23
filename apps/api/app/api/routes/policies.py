from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.tables import RefuelEuTarget
from app.schemas.policies import PolicyTarget
from app.security import require_admin_token

router = APIRouter()

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
