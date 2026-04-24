"""Pydantic schemas for SQLite models."""

from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MarketPriceBase(BaseModel):
    """Base market price schema."""
    market_type: str = Field(..., description="Market type: ARA, US_Gulf, EU_ETS")
    price: float = Field(..., description="Price value")
    unit: str = Field(..., description="Unit of price (USD/bbl, EUR/tonne, etc.)")
    source: Optional[str] = None


class MarketPriceCreate(MarketPriceBase):
    """Schema for creating market price."""
    timestamp: datetime = Field(default_factory=_utcnow)


class MarketPriceUpdate(BaseModel):
    """Schema for updating market price."""
    price: Optional[float] = None
    unit: Optional[str] = None


class MarketPriceRead(MarketPriceBase):
    """Schema for reading market price."""
    id: str
    timestamp: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class UserScenarioBase(BaseModel):
    """Base user scenario schema."""
    scenario_name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    parameters: dict[str, Any] = Field(..., description="JSON parameters for scenario")


class UserScenarioCreate(UserScenarioBase):
    """Schema for creating user scenario."""
    pass


class UserScenarioUpdate(BaseModel):
    """Schema for updating user scenario."""
    scenario_name: Optional[str] = None
    description: Optional[str] = None
    parameters: Optional[dict[str, Any]] = None


class UserScenarioRead(UserScenarioBase):
    """Schema for reading user scenario."""
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MarketAlertBase(BaseModel):
    """Base market alert schema."""
    market_type: str = Field(..., description="Market type: ARA, US_Gulf, EU_ETS")
    threshold_type: str = Field(..., description="Type: 'above' or 'below'")
    threshold_value: float
    status: str = Field(default="active", description="Status: active or inactive")


class MarketAlertCreate(MarketAlertBase):
    """Schema for creating market alert."""
    pass


class MarketAlertUpdate(BaseModel):
    """Schema for updating market alert."""
    threshold_type: Optional[str] = None
    threshold_value: Optional[float] = None
    status: Optional[str] = None


class MarketAlertRead(MarketAlertBase):
    """Schema for reading market alert."""
    id: str
    last_triggered: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PriceCacheRead(BaseModel):
    """Schema for reading price cache."""
    market_type: str
    cached_data: dict
    last_updated: datetime
    expires_at: datetime

    class Config:
        from_attributes = True
