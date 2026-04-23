from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class WorkspacePreference(Base):
    __tablename__ = "workspace_preferences"

    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), primary_key=True)
    preferences: Mapped[dict] = mapped_column(JSON)
    route_edits: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferences: Mapped[dict] = mapped_column(JSON)
    route_edits: Mapped[dict] = mapped_column(JSON)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MarketSnapshot(Base):
    __tablename__ = "market_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_key: Mapped[str] = mapped_column(String(80), index=True)
    metric_key: Mapped[str] = mapped_column(String(80), index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(32))
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict] = mapped_column(JSON)


class MarketRefreshRun(Base):
    __tablename__ = "market_refresh_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    refreshed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source_status: Mapped[str] = mapped_column(String(24), index=True)
    sources: Mapped[dict] = mapped_column(JSON)
    ingest: Mapped[str] = mapped_column(String(32))


class RouteCatalog(Base):
    __tablename__ = "route_catalog"

    pathway_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    pathway: Mapped[str] = mapped_column(Text)
    base_cost_usd_per_l: Mapped[float] = mapped_column(Float)
    co2_savings_kg_per_l: Mapped[float] = mapped_column(Float)
    category: Mapped[str] = mapped_column(String(24))


class RefuelEuTarget(Base):
    __tablename__ = "refuel_eu_targets"

    year: Mapped[int] = mapped_column(primary_key=True)
    saf_share_pct: Mapped[float] = mapped_column(Float)
    synthetic_share_pct: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(120))


class ReservesCoverage(Base):
    __tablename__ = "reserves_coverage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    country_iso: Mapped[str] = mapped_column(String(8), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    stock_days: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(80))
    confidence: Mapped[float] = mapped_column(Float)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_reserves_coverage_country_iso_timestamp", "country_iso", timestamp.desc()),
    )


class TippingEvent(Base):
    __tablename__ = "tipping_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    event_type: Mapped[str] = mapped_column(
        Enum("ALERT", "CRITICAL", "CROSSOVER", name="tipping_event_type", native_enum=False, create_constraint=True),
    )
    gap_usd_per_litre: Mapped[float] = mapped_column(Float)
    fossil_price: Mapped[float] = mapped_column(Float)
    saf_effective_price: Mapped[float] = mapped_column(Float)
    saf_pathway: Mapped[str] = mapped_column(String(120))
    triggered_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON)  # mapped as DB column `metadata`

    __table_args__ = (
        Index("ix_tipping_events_event_type_timestamp", "event_type", timestamp.desc()),
    )
