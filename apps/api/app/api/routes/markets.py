"""Market prices CRUD endpoints for SQLite persistence."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.sqlite_models import MarketPrice
from app.schemas.sqlite_schemas import (
    MarketPriceCreate,
    MarketPriceRead,
    MarketPriceUpdate,
)
from app.services.cache import PriceCacheService

router = APIRouter(prefix="/market-prices", tags=["market-prices"])


@router.get("", response_model=list[MarketPriceRead])
def list_market_prices(
    start_date: Optional[datetime] = Query(None, description="Start date for price range"),
    end_date: Optional[datetime] = Query(None, description="End date for price range"),
    market_type: Optional[str] = Query(None, description="Filter by market type (ARA, US_Gulf, EU_ETS)"),
    db: Session = Depends(get_db),
):
    """List market prices with optional filtering.
    
    Query parameters:
    - start_date: ISO format datetime
    - end_date: ISO format datetime
    - market_type: Market type filter
    """
    query = db.query(MarketPrice)

    if market_type:
        query = query.filter(MarketPrice.market_type == market_type)

    if start_date:
        query = query.filter(MarketPrice.timestamp >= start_date)

    if end_date:
        query = query.filter(MarketPrice.timestamp <= end_date)

    prices = query.order_by(MarketPrice.timestamp.desc()).all()
    return prices


@router.get("/{price_id}", response_model=MarketPriceRead)
def get_market_price(price_id: str, db: Session = Depends(get_db)):
    """Get specific market price by ID."""
    price = db.query(MarketPrice).filter(MarketPrice.id == price_id).first()
    if not price:
        raise HTTPException(status_code=404, detail="Market price not found")
    return price


@router.post("", response_model=MarketPriceRead, status_code=201)
def create_market_price(
    price_data: MarketPriceCreate, db: Session = Depends(get_db)
):
    """Create new market price entry."""
    # Validate market_type
    valid_types = {"ARA", "US_Gulf", "EU_ETS"}
    if price_data.market_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid market_type. Must be one of: {valid_types}",
        )

    price = MarketPrice(**price_data.model_dump())
    db.add(price)
    db.commit()
    db.refresh(price)

    # Invalidate cache for this market type
    PriceCacheService.invalidate_cache(db, price.market_type)

    return price


@router.put("/{price_id}", response_model=MarketPriceRead)
def update_market_price(
    price_id: str,
    price_data: MarketPriceUpdate,
    db: Session = Depends(get_db),
):
    """Update market price."""
    price = db.query(MarketPrice).filter(MarketPrice.id == price_id).first()
    if not price:
        raise HTTPException(status_code=404, detail="Market price not found")

    update_data = price_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(price, key, value)

    db.add(price)
    db.commit()
    db.refresh(price)

    # Invalidate cache
    PriceCacheService.invalidate_cache(db, price.market_type)

    return price


@router.delete("/{price_id}", status_code=204)
def delete_market_price(price_id: str, db: Session = Depends(get_db)):
    """Delete market price."""
    price = db.query(MarketPrice).filter(MarketPrice.id == price_id).first()
    if not price:
        raise HTTPException(status_code=404, detail="Market price not found")

    market_type = price.market_type
    db.delete(price)
    db.commit()

    # Invalidate cache
    PriceCacheService.invalidate_cache(db, market_type)


@router.get("/latest/{market_type}", response_model=Optional[MarketPriceRead])
def get_latest_price(market_type: str, db: Session = Depends(get_db)):
    """Get latest price for market type (uses cache if available)."""
    # Check cache first
    cache = PriceCacheService.get_cache(db, market_type)
    if cache and cache.cached_data:
        # Return cached latest price
        return cache.cached_data.get("latest")

    # Fetch from DB
    price = db.query(MarketPrice).filter(
        MarketPrice.market_type == market_type
    ).order_by(MarketPrice.timestamp.desc()).first()

    if price:
        # Cache the result
        cache_data = {
            "latest": price.__dict__,
            "timestamp": datetime.utcnow().isoformat(),
        }
        PriceCacheService.set_cache(db, market_type, cache_data)

    return price
