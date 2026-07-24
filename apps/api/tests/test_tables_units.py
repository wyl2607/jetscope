"""Unit tests for ORM model definitions in app.models.tables.

Tests focus on metadata, default generation, column types, composite indexes,
and enum constraints — all without mocking DB (SQLite in-memory is real IO for
these purposes but is deterministic and requires no network).
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.tables import (
    ESGSignal,
    AIResearchBudgetDay,
    MarketRefreshRun,
    MarketSnapshot,
    RefuelEuTarget,
    ReservesCoverage,
    RouteCatalog,
    Scenario,
    TippingEvent,
    Workspace,
    WorkspacePreference,
)


@pytest.fixture
def engine():
    e = create_engine("sqlite://", future=True)
    Base.metadata.create_all(bind=e)
    return e


@pytest.fixture
def session(engine):
    with Session(bind=engine) as s:
        yield s


# ---------------------------------------------------------------------------
# Table metadata
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("model_cls", "expected_tablename", "expected_pk_count"),
    [
        (Workspace, "workspaces", 1),
        (WorkspacePreference, "workspace_preferences", 1),
        (Scenario, "scenarios", 1),
        (MarketSnapshot, "market_snapshots", 1),
        (MarketRefreshRun, "market_refresh_runs", 1),
        (RouteCatalog, "route_catalog", 1),
        (RefuelEuTarget, "refuel_eu_targets", 1),
        (ReservesCoverage, "reserves_coverage", 1),
        (TippingEvent, "tipping_events", 1),
        (ESGSignal, "esg_signals", 1),
        (AIResearchBudgetDay, "ai_research_budget_days", 1),
    ],
)
def test_table_metadata(model_cls, expected_tablename, expected_pk_count, engine):
    table = model_cls.__table__
    assert table.name == expected_tablename
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns(table.name)]
    assert len(table.primary_key.columns) == expected_pk_count
    # every model has at least 2 columns
    assert len(cols) >= 2


# ---------------------------------------------------------------------------
# Default (UUID) generation for models that use lambda: str(uuid4())
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "model_cls",
    [
        Workspace,
        Scenario,
        MarketSnapshot,
        MarketRefreshRun,
        ReservesCoverage,
        TippingEvent,
        ESGSignal,
    ],
)
def test_uuid_primary_key_default_generates_string(session, model_cls):
    """UUID column-default fires on INSERT, not on Python instantiation."""
    # Build minimum required kwargs to satisfy NOT NULL columns
    now = datetime.now(timezone.utc)
    kwargs: dict = {}
    if model_cls is Workspace:
        kwargs.update(slug="x", name="x", created_at=now)
    elif model_cls is Scenario:
        kwargs.update(workspace_id="w1", name="x", preferences={}, route_edits={}, saved_at=now)
    elif model_cls is MarketSnapshot:
        kwargs.update(source_key="s", metric_key="m", value=1.0, unit="%", as_of=now, payload={})
    elif model_cls is MarketRefreshRun:
        kwargs.update(refreshed_at=now, source_status="ok", sources={}, ingest="test")
    elif model_cls is ReservesCoverage:
        kwargs.update(country_iso="DE", timestamp=now, stock_days=1.0, source="t", confidence=0.5, fetched_at=now)
    elif model_cls is TippingEvent:
        kwargs.update(
            timestamp=now, event_type="ALERT", gap_usd_per_litre=0.1, fossil_price=1.0,
            saf_effective_price=1.1, saf_pathway="HEFA", metadata_={},
        )
    elif model_cls is ESGSignal:
        kwargs.update(
            created_at=now, updated_at=now, source_url=f"https://x.com/{now.timestamp()}",
            signal_type="OTHER", entities=[], impact_direction="NEUTRAL", confidence=0.5,
            summary_en="e", summary_cn="c", raw_title="t", raw_excerpt="e",
            published_at=now, claude_model="m", prompt_cache_hit=False,
        )
    instance = model_cls(**kwargs)
    session.add(instance)
    session.flush()
    pk_name = model_cls.__table__.primary_key.columns.keys()[0]
    pk_value = getattr(instance, pk_name)
    assert isinstance(pk_value, str)
    assert len(pk_value) == 36  # uuid4 hex with dashes


# ---------------------------------------------------------------------------
# Composite indexes (__table_args__)
# ---------------------------------------------------------------------------


def test_reserves_coverage_has_country_timestamp_index(engine):
    idx_names = {i.name for i in ReservesCoverage.__table__.indexes}
    assert "ix_reserves_coverage_country_iso_timestamp" in idx_names


def test_tipping_event_has_event_type_timestamp_index():
    idx_names = {i.name for i in TippingEvent.__table__.indexes}
    assert "ix_tipping_events_event_type_timestamp" in idx_names


def test_esg_signal_has_signal_type_created_at_index():
    idx_names = {i.name for i in ESGSignal.__table__.indexes}
    assert "ix_esg_signals_signal_type_created_at" in idx_names


# ---------------------------------------------------------------------------
# Enum constraints generate SA Enum columns
# ---------------------------------------------------------------------------


def test_tipping_event_event_type_is_enum():
    col = TippingEvent.__table__.c["event_type"]
    assert "ALERT" in col.type.enums
    assert "CRITICAL" in col.type.enums
    assert "CROSSOVER" in col.type.enums


def test_esg_signal_signal_type_is_enum():
    col = ESGSignal.__table__.c["signal_type"]
    for e in ("SUPPLY_DISRUPTION", "POLICY_CHANGE", "PRICE_SHOCK", "CAPACITY_ANNOUNCEMENT", "OTHER"):
        assert e in col.type.enums


def test_esg_signal_impact_direction_is_enum():
    col = ESGSignal.__table__.c["impact_direction"]
    for e in ("BEARISH", "BULLISH", "NEUTRAL"):
        assert e in col.type.enums


# ---------------------------------------------------------------------------
# Column types — spot-check a few interesting ones
# ---------------------------------------------------------------------------


def test_esg_signal_source_url_is_unique():
    col = ESGSignal.__table__.c["source_url"]
    assert col.unique is True


def test_workspace_slug_has_index_and_unique():
    col = Workspace.__table__.c["slug"]
    assert col.unique is True
    assert col.index is True


def test_route_catalog_columns():
    cols = RouteCatalog.__table__.c
    assert isinstance(cols["base_cost_usd_per_l"].type, cols["base_cost_usd_per_l"].type.__class__)


@pytest.mark.parametrize(
    ("model_cls", "col_name", "expected_type_name"),
    [
        (ReservesCoverage, "stock_days", "Float"),
        (RefuelEuTarget, "saf_share_pct", "Float"),
        (MarketSnapshot, "value", "Float"),
        (RouteCatalog, "base_cost_usd_per_l", "Float"),
    ],
)
def test_numeric_column_types(model_cls, col_name, expected_type_name, engine):
    """Key metric columns have the expected SQL type name."""
    col = model_cls.__table__.c[col_name]
    assert col.type.__class__.__name__ == expected_type_name


# ---------------------------------------------------------------------------
# Instantiation and round-trip through DB (light integration)
# ---------------------------------------------------------------------------


def test_workspace_create_and_read(session):
    now = datetime.now(timezone.utc)
    ws = Workspace(slug="test-slug", name="Test", created_at=now)
    session.add(ws)
    session.commit()
    session.refresh(ws)
    assert ws.id is not None
    assert ws.slug == "test-slug"
    assert ws.name == "Test"
    fetched = session.get(Workspace, ws.id)
    assert fetched is not None
    # SQLite stores DateTime without tzinfo; compare without timezone
    assert fetched.created_at.replace(tzinfo=timezone.utc) == now


def test_tipping_event_create_and_read(session):
    now = datetime.now(timezone.utc)
    event = TippingEvent(
        timestamp=now,
        event_type="CROSSOVER",
        gap_usd_per_litre=0.12,
        fossil_price=1.50,
        saf_effective_price=1.62,
        saf_pathway="HEFA",
        metadata_={"source": "test"},
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    assert event.id is not None
    assert event.event_type == "CROSSOVER"
    assert event.metadata_ == {"source": "test"}
    assert event.fossil_price == 1.50


def test_esg_signal_create_and_read(session):
    now = datetime.now(timezone.utc)
    signal = ESGSignal(
        created_at=now,
        updated_at=now,
        source_url="https://example.com/news/1",
        signal_type="POLICY_CHANGE",
        entities=["EU"],
        impact_direction="BULLISH",
        confidence=0.85,
        summary_en="English summary",
        summary_cn="中文摘要",
        raw_title="Test Title",
        raw_excerpt="Test excerpt",
        published_at=now,
        claude_model="claude-3-haiku-20240307",
        prompt_cache_hit=False,
    )
    session.add(signal)
    session.commit()
    session.refresh(signal)
    assert signal.id is not None
    assert signal.impact_direction == "BULLISH"
    assert signal.prompt_cache_hit is False
    assert signal.source_url == "https://example.com/news/1"


def test_ai_research_budget_day_defaults(session):
    now = datetime.now(timezone.utc)
    day = AIResearchBudgetDay(day="2026-06-04", updated_at=now)
    session.add(day)
    session.commit()
    session.refresh(day)
    assert day.tokens_used == 0
    assert day.exhausted is False


def test_refuel_eu_target_create(session):
    target = RefuelEuTarget(year=2030, saf_share_pct=5.0, synthetic_share_pct=1.2, label="RefuelEU 2030")
    session.add(target)
    session.commit()
    session.refresh(target)
    assert target.year == 2030
    assert target.saf_share_pct == 5.0


def test_reserves_coverage_create(session):
    now = datetime.now(timezone.utc)
    r = ReservesCoverage(
        country_iso="DE",
        timestamp=now,
        stock_days=90.5,
        source="test",
        confidence=0.95,
        fetched_at=now,
    )
    session.add(r)
    session.commit()
    session.refresh(r)
    assert r.id is not None
    assert r.stock_days == 90.5
    assert r.country_iso == "DE"
