from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.tables import MarketSnapshot
from app.schemas.market import (
    MarketHistoryResponse,
    MarketRefreshResponse,
    MarketSnapshotResponse,
)
from app.security import require_admin_token
from app.services.market import (
    build_market_history_response,
    build_market_snapshot_response,
    refresh_market_snapshot_set,
)

router = APIRouter()


@router.get("/snapshot", response_model=MarketSnapshotResponse)
def get_market_snapshot(db: Session = Depends(get_db)) -> MarketSnapshotResponse:
    return build_market_snapshot_response(db)


@router.get("/history", response_model=MarketHistoryResponse)
def get_market_history(db: Session = Depends(get_db)) -> MarketHistoryResponse:
    return build_market_history_response(db)


@router.post("/refresh", response_model=MarketRefreshResponse)
def refresh_market_snapshot(
    _auth: None = Depends(require_admin_token), db: Session = Depends(get_db)
) -> MarketRefreshResponse:
    refreshed_at, source_status = refresh_market_snapshot_set(db)
    persisted_metric_count = db.scalar(
        select(func.count()).select_from(MarketSnapshot).where(MarketSnapshot.as_of == refreshed_at)
    )
    return MarketRefreshResponse(
        accepted=True,
        message=f"Market snapshot refreshed at {refreshed_at.isoformat()} (status={source_status})",
        refreshed_at=refreshed_at,
        source_status=source_status,
        persisted_metric_count=int(persisted_metric_count or 0),
        ingest="live-refresh" if source_status != "skipped-lock" else "skipped-lock",
    )
