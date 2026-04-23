from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tables import Workspace


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
