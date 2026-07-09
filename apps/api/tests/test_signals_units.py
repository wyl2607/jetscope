from __future__ import annotations

import importlib
import importlib.util
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path


class FakeField:
    def __init__(self, name: str):
        self.name = name

    def __eq__(self, other):
        return ("eq", self.name, other)

    def __ge__(self, other):
        return ("ge", self.name, other)

    def desc(self):
        return ("desc", self.name)


class FakeESGSignal:
    source_url = FakeField("source_url")
    created_at = FakeField("created_at")
    signal_type = FakeField("signal_type")

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class FakeSelectQuery:
    def __init__(self, model):
        self.model = model
        self.filters = []
        self.order_clause = None
        self.limit_value = None

    def where(self, condition):
        self.filters.append(condition)
        return self

    def order_by(self, clause):
        self.order_clause = clause
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self


def _fake_select(model):
    return FakeSelectQuery(model)


class FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class FakeSession:
    def __init__(self, *, existing=None, rows=None):
        self.existing = existing
        self.rows = list(rows or [])
        self.added = []
        self.commits = 0
        self.refreshed = []
        self.scalar_queries = []
        self.scalars_queries = []

    def scalar(self, query):
        self.scalar_queries.append(query)
        return self.existing

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        self.refreshed.append(obj)

    def scalars(self, query):
        self.scalars_queries.append(query)
        filtered = list(self.rows)
        for op, name, value in query.filters:
            if op == "ge":
                filtered = [row for row in filtered if getattr(row, name) >= value]
            elif op == "eq":
                filtered = [row for row in filtered if getattr(row, name) == value]
        if query.order_clause == ("desc", "created_at"):
            filtered.sort(key=lambda row: row.created_at, reverse=True)
        if query.limit_value is not None:
            filtered = filtered[: query.limit_value]
        return FakeScalars(filtered)


def _install_import_stubs(monkeypatch):
    sqlalchemy_mod = types.ModuleType("sqlalchemy")
    sqlalchemy_mod.select = _fake_select
    orm_mod = types.ModuleType("sqlalchemy.orm")
    orm_mod.Session = object

    tables_mod = types.ModuleType("app.models.tables")
    tables_mod.ESGSignal = FakeESGSignal

    claude_mod = types.ModuleType("app.services.ai_research.claude_pipeline")

    class ExtractedSignal:
        pass

    claude_mod.ExtractedSignal = ExtractedSignal

    scraper_mod = types.ModuleType("app.services.ai_research.scraper")

    class RawArticle:
        pass

    scraper_mod.RawArticle = RawArticle

    monkeypatch.setitem(sys.modules, "sqlalchemy", sqlalchemy_mod)
    monkeypatch.setitem(sys.modules, "sqlalchemy.orm", orm_mod)
    monkeypatch.setitem(sys.modules, "app.models.tables", tables_mod)
    monkeypatch.setitem(sys.modules, "app.services.ai_research.claude_pipeline", claude_mod)
    monkeypatch.setitem(sys.modules, "app.services.ai_research.scraper", scraper_mod)


def _signals_module(monkeypatch):
    _install_import_stubs(monkeypatch)
    module_name = "signals_unit_under_test"
    sys.modules.pop(module_name, None)
    module_path = Path(__file__).resolve().parents[1] / "app/services/ai_research/signals.py"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _article(url: str, title: str = "Article"):
    return types.SimpleNamespace(
        title=title,
        url=url,
        excerpt="excerpt",
        published_at=datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc),
    )


def _extracted(
    *,
    signal_type: str = "OTHER",
    entities=None,
    impact_direction: str = "NEUTRAL",
    confidence: float = 0.5,
    summary_en: str = "en",
    summary_cn: str = "cn",
    claude_model: str = "mock",
    prompt_cache_hit: bool = False,
):
    return types.SimpleNamespace(
        signal_type=signal_type,
        entities=list(entities or []),
        impact_direction=impact_direction,
        confidence=confidence,
        summary_en=summary_en,
        summary_cn=summary_cn,
        claude_model=claude_model,
        prompt_cache_hit=prompt_cache_hit,
    )


def test_persist_signals_creates_new_signal(monkeypatch):
    signals = _signals_module(monkeypatch)
    repo = signals.SignalRepository()
    db = FakeSession(existing=None)

    created = repo.persist_signals(
        db=db,
        raw_article=_article("https://example.com/new"),
        extracted=_extracted(
            signal_type="PRICE_SHOCK",
            entities=["Brent"],
            impact_direction="BEARISH",
            confidence=0.92,
            prompt_cache_hit=True,
        ),
    )

    assert created.source_url == "https://example.com/new"
    assert created.signal_type == "PRICE_SHOCK"
    assert created.entities == ["Brent"]
    assert created.prompt_cache_hit is True
    assert created.created_at == created.updated_at
    assert db.commits == 1
    assert db.refreshed == [created]


def test_persist_signals_updates_existing_signal(monkeypatch):
    signals = _signals_module(monkeypatch)
    repo = signals.SignalRepository()
    old_time = datetime.now(timezone.utc) - timedelta(days=1)
    existing = FakeESGSignal(
        id="same-id",
        created_at=old_time,
        updated_at=old_time,
        source_url="https://example.com/dupe",
        signal_type="OTHER",
        entities=[],
        impact_direction="NEUTRAL",
        confidence=0.2,
        summary_en="old",
        summary_cn="old",
        raw_title="old",
        raw_excerpt="old",
        published_at=old_time,
        claude_model="mock",
        prompt_cache_hit=False,
    )
    db = FakeSession(existing=existing)

    updated = repo.persist_signals(
        db=db,
        raw_article=_article("https://example.com/dupe", title="New title"),
        extracted=_extracted(
            signal_type="POLICY_CHANGE",
            entities=["EU"],
            impact_direction="BULLISH",
            confidence=0.77,
            summary_en="new",
            summary_cn="新",
            claude_model="claude-sonnet-4-6",
            prompt_cache_hit=True,
        ),
    )

    assert updated is existing
    assert updated.id == "same-id"
    assert updated.signal_type == "POLICY_CHANGE"
    assert updated.raw_title == "New title"
    assert updated.summary_en == "new"
    assert updated.updated_at > old_time
    assert db.commits == 1


def test_list_recent_filters_orders_and_limits(monkeypatch):
    signals = _signals_module(monkeypatch)
    repo = signals.SignalRepository()
    now = datetime.now(timezone.utc)
    rows = [
        FakeESGSignal(id="a", created_at=now - timedelta(hours=4), signal_type="OTHER"),
        FakeESGSignal(id="b", created_at=now - timedelta(hours=2), signal_type="PRICE_SHOCK"),
        FakeESGSignal(id="c", created_at=now - timedelta(minutes=30), signal_type="PRICE_SHOCK"),
    ]
    db = FakeSession(rows=rows)

    result = repo.list_recent(
        db=db,
        since=now - timedelta(hours=3),
        limit=1,
        signal_type="PRICE_SHOCK",
    )

    assert [item.id for item in result] == ["c"]
    assert result[0].signal_type == "PRICE_SHOCK"
    assert result[0].created_at >= now - timedelta(hours=3)

    query = db.scalars_queries[0]
    assert ("ge", "created_at", now - timedelta(hours=3)) in query.filters
    assert ("eq", "signal_type", "PRICE_SHOCK") in query.filters
    assert query.order_clause == ("desc", "created_at")
    assert query.limit_value == 1
