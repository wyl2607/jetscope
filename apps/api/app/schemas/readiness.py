from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ReadinessSeverity = Literal["ok", "review", "blocker"]


class ReadinessAction(BaseModel):
    key: str
    href: str | None = None
    config_keys: list[str] = Field(default_factory=list)


class ReadinessCheck(BaseModel):
    ok: bool
    status: str
    detail: str | None = None
    severity: ReadinessSeverity = "ok"
    blocking: bool = False
    action: ReadinessAction | None = None


class ReadinessResponse(BaseModel):
    ready: bool
    status: str
    generated_at: datetime
    service: str = "api"
    version: str = "0.1.0"
    environment: str
    api_prefix: str
    schema_bootstrap_mode: str
    degraded: bool = False
    checks: dict[str, ReadinessCheck] = Field(default_factory=dict)
