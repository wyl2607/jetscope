from datetime import datetime

from pydantic import BaseModel, Field


class ReadinessCheck(BaseModel):
    ok: bool
    status: str
    detail: str | None = None


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
