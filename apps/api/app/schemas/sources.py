from datetime import datetime

from pydantic import BaseModel, Field


class SourceCoverageMetric(BaseModel):
    metric_key: str
    source_name: str
    source_type: str
    confidence_score: float = Field(ge=0, le=1)
    lag_minutes: int | None = None
    fallback_used: bool = False
    status: str
    region: str
    market_scope: str


class SourceCoverageResponse(BaseModel):
    generated_at: datetime
    metrics: list[SourceCoverageMetric]
    completeness: float = Field(ge=0.0, le=1.0, default=1.0)
    degraded: bool = False
