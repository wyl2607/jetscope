from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.state import PreferencesPayload, RouteEditPayload


class ScenarioCreate(BaseModel):
    name: str
    preferences: PreferencesPayload = Field(default_factory=PreferencesPayload)
    route_edits: dict[str, RouteEditPayload] = Field(default_factory=dict)


class ScenarioRecord(ScenarioCreate):
    id: str
    workspace_slug: str
    saved_at: datetime
