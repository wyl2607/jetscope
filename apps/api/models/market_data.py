"""Pydantic models for market data metrics."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class MarketPrice(BaseModel):
    """SAF market price in USD per barrel."""

    price: float = Field(..., ge=0, description="USD/barrel")
    source: str = Field(..., description="Data source")
    confidence: float = Field(..., ge=0, le=1, description="Confidence 0-1")
    freshness_seconds: int = Field(..., ge=0, description="Data age seconds")
    error_code: Optional[str] = Field(None, description="Error code if failed")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "price": 115.5,
            "source": "OpenAQ",
            "confidence": 0.95,
            "freshness_seconds": 300,
            "error_code": None,
        }
    })


class CarbonIntensity(BaseModel):
    """EU carbon intensity kg CO2/MJ."""

    value: float = Field(..., ge=0, description="kg CO2/MJ")
    source: str = Field(..., description="Data source")
    confidence: float = Field(..., ge=0, le=1, description="Confidence 0-1")
    freshness_seconds: int = Field(..., ge=0, description="Data age seconds")
    error_code: Optional[str] = Field(None, description="Error code if failed")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class GermanyPremium(BaseModel):
    """German SAF premium % above Brent."""

    premium_pct: float = Field(..., ge=0, description="Premium %")
    source: str = Field(..., description="Data source")
    confidence: float = Field(..., ge=0, le=1, description="Confidence 0-1")
    freshness_seconds: int = Field(..., ge=0, description="Data age seconds")
    error_code: Optional[str] = Field(None, description="Error code if failed")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class RotterdamEmissions(BaseModel):
    """Rotterdam port air quality."""

    pm25_ugm3: Optional[float] = Field(None, ge=0, description="PM2.5 µg/m³")
    no2_ppb: Optional[float] = Field(None, ge=0, description="NO2 ppb")
    wind_speed_ms: Optional[float] = Field(None, ge=0, description="Wind m/s")
    source: str = Field(..., description="Data source")
    confidence: float = Field(..., ge=0, le=1, description="Confidence 0-1")
    freshness_seconds: int = Field(..., ge=0, description="Data age seconds")
    error_code: Optional[str] = Field(None, description="Error code if failed")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class EUETSVolume(BaseModel):
    """EU ETS allowance price and volume."""

    price_eur: float = Field(..., ge=0, description="EUR/ton CO2e")
    volume_tons: Optional[int] = Field(None, ge=0, description="Volume tons")
    source: str = Field(..., description="Data source")
    confidence: float = Field(..., ge=0, le=1, description="Confidence 0-1")
    freshness_seconds: int = Field(..., ge=0, description="Data age seconds")
    error_code: Optional[str] = Field(None, description="Error code if failed")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class Freshness(BaseModel):
    """Data freshness summary."""

    oldest_data_seconds: int = Field(..., ge=0, description="Oldest data age")
    newest_data_seconds: int = Field(..., ge=0, description="Newest data age")
    average_age_seconds: float = Field(..., ge=0, description="Average age")
    source: str = Field(default="freshness_aggregator", description="Source")
    confidence: float = Field(..., ge=0, le=1, description="Confidence 0-1")
    freshness_seconds: int = Field(..., ge=0, description="Report age seconds")
    error_code: Optional[str] = Field(None, description="Error code if failed")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SourceStatus(BaseModel):
    """Status of a data source."""

    source_name: str = Field(..., description="Source name")
    source_id: str = Field(..., description="Source identifier")
    status: str = Field(..., description="Status: healthy, degraded, unavailable")
    confidence: float = Field(..., ge=0, le=1, description="Status confidence")
    last_successful_fetch: Optional[datetime] = Field(None, description="Last OK")
    consecutive_failures: int = Field(..., ge=0, description="Failure count")
    error_code: Optional[str] = Field(None, description="Last error code")
    cache_ttl_seconds: int = Field(..., ge=0, description="Cache TTL seconds")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
