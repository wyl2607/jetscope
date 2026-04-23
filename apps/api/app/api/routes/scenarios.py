from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.tables import Scenario
from app.schemas.scenarios import ScenarioCreate, ScenarioRecord
from app.security import require_admin_token
from app.services.bootstrap import ensure_workspace, utcnow

router = APIRouter()


@router.get("", response_model=list[ScenarioRecord])
def list_scenarios(workspace_slug: str, db: Session = Depends(get_db)) -> list[ScenarioRecord]:
    workspace = ensure_workspace(db, workspace_slug)
    rows = db.scalars(
        select(Scenario)
        .where(Scenario.workspace_id == workspace.id)
        .order_by(Scenario.saved_at.desc())
    ).all()

    return [
        ScenarioRecord(
            id=row.id,
            workspace_slug=workspace_slug,
            name=row.name,
            saved_at=row.saved_at,
            preferences=row.preferences,
            route_edits=row.route_edits,
        )
        for row in rows
    ]


@router.post("", response_model=ScenarioRecord)
def create_scenario(
    workspace_slug: str,
    payload: ScenarioCreate,
    _auth: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> ScenarioRecord:
    workspace = ensure_workspace(db, workspace_slug)
    preferences_payload = payload.preferences.model_dump(mode="json")
    route_edits_payload = {
        route_id: route_edit.model_dump(mode="json", exclude_none=True)
        for route_id, route_edit in payload.route_edits.items()
    }
    row = Scenario(
        workspace_id=workspace.id,
        name=payload.name,
        description=None,
        preferences=preferences_payload,
        route_edits=route_edits_payload,
        saved_at=utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return ScenarioRecord(
        id=row.id,
        workspace_slug=workspace_slug,
        name=row.name,
        saved_at=row.saved_at,
        preferences=row.preferences,
        route_edits=row.route_edits,
    )


@router.put("/{scenario_id}", response_model=ScenarioRecord)
def update_scenario(
    workspace_slug: str,
    scenario_id: str,
    payload: ScenarioCreate,
    _auth: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> ScenarioRecord:
    workspace = ensure_workspace(db, workspace_slug)
    preferences_payload = payload.preferences.model_dump(mode="json")
    route_edits_payload = {
        route_id: route_edit.model_dump(mode="json", exclude_none=True)
        for route_id, route_edit in payload.route_edits.items()
    }
    row = db.scalar(
        select(Scenario).where(Scenario.id == scenario_id, Scenario.workspace_id == workspace.id)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    row.name = payload.name
    row.preferences = preferences_payload
    row.route_edits = route_edits_payload
    row.saved_at = utcnow()
    db.commit()
    db.refresh(row)

    return ScenarioRecord(
        id=row.id,
        workspace_slug=workspace_slug,
        name=row.name,
        saved_at=row.saved_at,
        preferences=row.preferences,
        route_edits=row.route_edits,
    )


@router.delete("/{scenario_id}", response_model=dict)
def delete_scenario(
    workspace_slug: str,
    scenario_id: str,
    _auth: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> dict:
    workspace = ensure_workspace(db, workspace_slug)
    row = db.scalar(
        select(Scenario).where(Scenario.id == scenario_id, Scenario.workspace_id == workspace.id)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    db.delete(row)
    db.commit()
    return {"workspace_slug": workspace_slug, "scenario_id": scenario_id, "deleted": True}
