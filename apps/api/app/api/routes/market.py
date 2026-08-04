from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from fastapi import Query

from app.schemas.market import (
    MarketHealthResponse,
    MarketHistoryResponse,
    MarketRefreshResponse,
    MarketSnapshotResponse,
)
from app.security import require_admin_token
from app.services.market import (
    build_market_health_response,
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


@router.get("/health", response_model=MarketHealthResponse)
def get_market_health(
    db: Session = Depends(get_db),
    runs_window: int = Query(10, ge=1, le=50, description="How many recent refresh runs to include"),
) -> MarketHealthResponse:
    return build_market_health_response(db, runs_window=runs_window)


@router.post("/refresh", response_model=MarketRefreshResponse)
def refresh_market_snapshot(
    _auth: None = Depends(require_admin_token), db: Session = Depends(get_db)
) -> MarketRefreshResponse:
    refreshed_at, source_status = refresh_market_snapshot_set(db)
    return MarketRefreshResponse(
        accepted=True,
        message=f"Market snapshot refreshed at {refreshed_at.isoformat()} (status={source_status})",
    )
