from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.tables import WorkspacePreference
from app.schemas.preferences import PreferenceDocument, PreferenceUpdate
from app.security import require_admin_token
from app.services.bootstrap import ensure_workspace, utcnow

router = APIRouter()

DEFAULT_PREFERENCES = {
    "schema_version": 1,
    "crudeSource": "brentEia",
    "carbonSource": "cbamCarbonProxyUsd",
    "benchmarkMode": "live-jet-spot",
}


@router.get("", response_model=PreferenceDocument)
def get_preferences(workspace_slug: str, db: Session = Depends(get_db)) -> PreferenceDocument:
    workspace = ensure_workspace(db, workspace_slug)
    row = db.scalar(
        select(WorkspacePreference).where(WorkspacePreference.workspace_id == workspace.id)
    )

    if row is None:
        return PreferenceDocument(
            workspace_slug=workspace_slug,
            preferences=DEFAULT_PREFERENCES,
            route_edits={},
        )

    return PreferenceDocument(
        workspace_slug=workspace_slug,
        preferences=row.preferences,
        route_edits=row.route_edits,
    )


@router.put("", response_model=PreferenceDocument)
def put_preferences(
    workspace_slug: str,
    payload: PreferenceUpdate,
    _auth: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> PreferenceDocument:
    workspace = ensure_workspace(db, workspace_slug)
    preferences_payload = payload.preferences.model_dump(mode="json")
    route_edits_payload = {
        route_id: route_edit.model_dump(mode="json", exclude_none=True)
        for route_id, route_edit in payload.route_edits.items()
    }
    row = db.scalar(
        select(WorkspacePreference).where(WorkspacePreference.workspace_id == workspace.id)
    )

    if row is None:
        row = WorkspacePreference(
            workspace_id=workspace.id,
            preferences=preferences_payload,
            route_edits=route_edits_payload,
            updated_at=utcnow(),
        )
        db.add(row)
    else:
        row.preferences = preferences_payload
        row.route_edits = route_edits_payload
        row.updated_at = utcnow()

    db.commit()

    return PreferenceDocument(
        workspace_slug=workspace_slug,
        preferences=row.preferences,
        route_edits=row.route_edits,
    )


@router.delete("", response_model=dict)
def delete_preferences(
    workspace_slug: str,
    _auth: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> dict:
    workspace = ensure_workspace(db, workspace_slug)
    row = db.scalar(
        select(WorkspacePreference).where(WorkspacePreference.workspace_id == workspace.id)
    )
    if row is not None:
        db.delete(row)
        db.commit()

    return {"workspace_slug": workspace_slug, "reset": True}
