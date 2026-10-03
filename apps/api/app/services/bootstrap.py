from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tables import RefuelEuTarget, RouteCatalog, Workspace
from app.services.analysis.pathway_costs import FOSSIL_JET_EMISSIONS_KG_PER_L, list_pathway_costs


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_workspace(db: Session, workspace_slug: str) -> Workspace:
    workspace = db.scalar(select(Workspace).where(Workspace.slug == workspace_slug))
    if workspace is not None:
        return workspace

    workspace = Workspace(
        slug=workspace_slug,
        name=workspace_slug.replace("-", " ").title() or "Default",
        created_at=utcnow(),
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


# Configuration defaults only: production-cost assumptions and policy targets,
# never market observations or market snapshot seed values.
DEFAULT_POLICY_TARGETS = [
    {"year": 2030, "saf_share_pct": 6, "synthetic_share_pct": 1.2, "label": "Early scale-up"},
    {"year": 2035, "saf_share_pct": 20, "synthetic_share_pct": 5, "label": "Commercial lift-off"},
    {"year": 2050, "saf_share_pct": 70, "synthetic_share_pct": 35, "label": "Long-run target"},
]


def _default_pathways() -> list[dict]:
    return [
        {
            "pathway_id": pathway.pathway_key,
            "name": pathway.name,
            "pathway": pathway.name,
            "base_cost_usd_per_l": pathway.midpoint_usd_per_l,
            "co2_savings_kg_per_l": (
                FOSSIL_JET_EMISSIONS_KG_PER_L * pathway.carbon_reduction_pct / 100
            ),
            "category": "saf",
        }
        for pathway in list_pathway_costs()
        if pathway.pathway_key != "fossil_jet_crisis"
    ]


def seed_configuration_defaults(db: Session) -> None:
    """Initialize empty configuration tables at startup, preserving operator data."""
    seeded = False
    if db.scalar(select(RouteCatalog.pathway_id).limit(1)) is None:
        db.add_all(RouteCatalog(**row) for row in _default_pathways())
        seeded = True
    if db.scalar(select(RefuelEuTarget.year).limit(1)) is None:
        db.add_all(RefuelEuTarget(**row) for row in DEFAULT_POLICY_TARGETS)
        seeded = True
    if seeded:
        db.commit()
