from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator


class SourceCoverageMetric(BaseModel):
    metric_key: str
    source_name: str
    source_type: str
    confidence_score: float = Field(ge=0, le=1)
    lag_minutes: int | None = Field(default=None, ge=0)
    fallback_used: bool = False
    status: str
    region: str
    market_scope: str
    error: str | None = None
    note: str | None = None
    cbam_eur: float | None = None
    usd_per_eur: float | None = None


class SourceCoverageResponse(BaseModel):
    generated_at: datetime
    metrics: list[SourceCoverageMetric]
    completeness: float = Field(ge=0.0, le=1.0, default=1.0)
    degraded: bool = False

    @field_validator("generated_at")
    @classmethod
    def generated_at_must_be_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            return value.replace(tzinfo=timezone.utc)
        return value
