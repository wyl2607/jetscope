from pydantic import BaseModel, Field

from app.schemas.state import PreferencesPayload, RouteEditPayload


class PreferenceUpdate(BaseModel):
    preferences: PreferencesPayload = Field(default_factory=PreferencesPayload)
    route_edits: dict[str, RouteEditPayload] = Field(default_factory=dict)


class PreferenceDocument(PreferenceUpdate):
    workspace_slug: str
