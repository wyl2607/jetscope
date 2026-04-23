"""Market alerts CRUD endpoints for SQLite persistence."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.sqlite import get_sqlite_db
from app.models.sqlite_models import MarketAlert
from app.schemas.sqlite_schemas import (
    MarketAlertCreate,
    MarketAlertRead,
    MarketAlertUpdate,
)

router = APIRouter(prefix="/sqlite/market-alerts", tags=["market-alerts-sqlite"])


@router.get("", response_model=list[MarketAlertRead])
def list_market_alerts(
    market_type: Optional[str] = Query(None, description="Filter by market type"),
    status: Optional[str] = Query(None, description="Filter by status (active/inactive)"),
    db: Session = Depends(get_sqlite_db),
):
    """List market alerts with optional filtering."""
    query = db.query(MarketAlert)

    if market_type:
        query = query.filter(MarketAlert.market_type == market_type)

    if status:
        query = query.filter(MarketAlert.status == status)

    alerts = query.order_by(MarketAlert.created_at.desc()).all()
    return alerts


@router.get("/{alert_id}", response_model=MarketAlertRead)
def get_market_alert(alert_id: str, db: Session = Depends(get_sqlite_db)):
    """Get specific market alert by ID."""
    alert = db.query(MarketAlert).filter(MarketAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.post("", response_model=MarketAlertRead, status_code=201)
def create_market_alert(
    alert_data: MarketAlertCreate,
    db: Session = Depends(get_sqlite_db),
):
    """Create new market alert."""
    # Validate market_type
    valid_types = {"ARA", "US_Gulf", "EU_ETS"}
    if alert_data.market_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid market_type. Must be one of: {valid_types}",
        )

    # Validate threshold_type
    if alert_data.threshold_type not in {"above", "below"}:
        raise HTTPException(
            status_code=400,
            detail="threshold_type must be 'above' or 'below'",
        )

    alert = MarketAlert(**alert_data.model_dump())
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@router.put("/{alert_id}", response_model=MarketAlertRead)
def update_market_alert(
    alert_id: str,
    alert_data: MarketAlertUpdate,
    db: Session = Depends(get_sqlite_db),
):
    """Update market alert."""
    alert = db.query(MarketAlert).filter(MarketAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    update_data = alert_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(alert, key, value)

    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=204)
def delete_market_alert(alert_id: str, db: Session = Depends(get_sqlite_db)):
    """Delete market alert."""
    alert = db.query(MarketAlert).filter(MarketAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    db.delete(alert)
    db.commit()


@router.put("/{alert_id}/trigger", response_model=MarketAlertRead)
def trigger_market_alert(alert_id: str, db: Session = Depends(get_sqlite_db)):
    """Mark alert as triggered with current timestamp."""
    from datetime import datetime

    alert = db.query(MarketAlert).filter(MarketAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.last_triggered = datetime.utcnow()
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert
