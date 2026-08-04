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
    # Pure arithmetic from values already in the snapshot; never invents prices.
    derived: dict[str, float | str] = Field(default_factory=dict)


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


class MarketRefreshRunSummary(BaseModel):
    id: str
    refreshed_at: datetime
    source_status: str
    ingest: str
    ok: bool


class MarketHealthResponse(BaseModel):
    generated_at: datetime
    refresh_interval_seconds: int
    latest_refreshed_at: datetime | None = None
    latest_status: str | None = None
    latest_ingest: str | None = None
    age_seconds: int | None = None
    next_refresh_eta_seconds: int | None = None
    runs_window: int = 10
    runs_total: int = 0
    runs_ok: int = 0
    success_rate: float | None = Field(default=None, ge=0.0, le=1.0)
    healthy: bool
    note: str
    recent_runs: list[MarketRefreshRunSummary] = Field(default_factory=list)
