"""SQLAlchemy models for SQLite persistence layer."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MarketPrice(Base):
    """Historical market price data for multiple market types."""
    __tablename__ = "market_prices"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    market_type: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )  # ARA, US_Gulf, EU_ETS
    price: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(24), nullable=False)  # USD/bbl, EUR/tonne, etc.
    source: Mapped[str] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("idx_market_prices_timestamp_market_type", "timestamp", "market_type"),
    )


class UserScenario(Base):
    """User-saved scenario configurations for analysis."""
    __tablename__ = "user_scenarios"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    scenario_name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    parameters: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        Index("idx_user_scenarios_user_id", "user_id"),
    )


class MarketAlert(Base):
    """Price alert configuration for market thresholds."""
    __tablename__ = "market_alerts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    market_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    threshold_type: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # above, below
    threshold_value: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active, inactive
    last_triggered: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        Index("idx_market_alerts_market_type_status", "market_type", "status"),
    )


class PriceCache(Base):
    """In-memory cache state tracking for 24h price data."""
    __tablename__ = "price_cache"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    market_type: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    cached_data: Mapped[dict] = mapped_column(JSON, nullable=False)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
