from datetime import datetime

from pydantic import BaseModel, Field


class SourceStatus(BaseModel):
    overall: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    freshness_minutes: int | None = None
    fallback_rate: float | None = Field(default=None, ge=0.0, le=100.0)
    is_fallback: bool | None = None


class MarketSourceDetail(BaseModel):
    source: str
    status: str
    value: float | None = None
    error: str | None = None
    note: str | None = None
    region: str
    market_scope: str
    lag_minutes: int | None = None
    confidence_score: float = Field(ge=0.0, le=1.0)
    fallback_used: bool = False
    cbam_eur: float | None = None
    usd_per_eur: float | None = None
    raw_usd_per_metric_ton: float | None = None
    raw_eur_per_t: float | None = None
    usd_per_t: float | None = None


class MarketSnapshotResponse(BaseModel):
    generated_at: datetime
    source_status: SourceStatus
    values: dict[str, float]
    source_details: dict[str, MarketSourceDetail] = Field(default_factory=dict)


class MarketHistoryPoint(BaseModel):
    as_of: datetime
    value: float


class MarketMetricHistory(BaseModel):
    metric_key: str
    unit: str
    latest_value: float
    latest_as_of: datetime
    change_pct_1d: float | None = None
    change_pct_7d: float | None = None
    change_pct_30d: float | None = None
    points: list[MarketHistoryPoint] = Field(default_factory=list)


class MarketHistoryResponse(BaseModel):
    generated_at: datetime
    windows_days: list[int] = Field(default_factory=lambda: [1, 7, 30])
    metrics: dict[str, MarketMetricHistory] = Field(default_factory=dict)


class MarketRefreshResponse(BaseModel):
    accepted: bool
    message: str
    refreshed_at: datetime | None = None
    source_status: str | None = None
    persisted_metric_count: int | None = None
    ingest: str | None = None
