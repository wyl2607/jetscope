from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.state import PreferencesPayload, RouteEditPayload

SCENARIO_NAME_MAX_LENGTH = 120


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=SCENARIO_NAME_MAX_LENGTH)
    preferences: PreferencesPayload = Field(default_factory=PreferencesPayload)
    route_edits: dict[str, RouteEditPayload] = Field(default_factory=dict)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("Scenario name must be a non-empty string")
        normalized = value.strip()
        if not normalized:
            raise ValueError("Scenario name must be a non-empty string")
        return normalized


class ScenarioRecord(ScenarioCreate):
    id: str
    workspace_slug: str
    saved_at: datetime
