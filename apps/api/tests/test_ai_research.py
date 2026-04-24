from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
import sys
import types

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.router import api_router
from app.db.base import Base
from app.db.session import get_db
from app.models.tables import AIResearchBudgetDay, ESGSignal
from app.services.ai_research import run_daily_pipeline
from app.services.ai_research.claude_pipeline import BudgetExceeded, ClaudeSignalExtractor
from app.services.ai_research.scraper import RawArticle
from app.services.ai_research.signals import SignalRepository


@pytest.fixture
def db_path(tmp_path: Path):
    return tmp_path / "test_ai_research.sqlite3"


@pytest.fixture
def session_factory(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@pytest.fixture
def client(session_factory):
    app = FastAPI(title="ai-research-route-test")
    app.include_router(api_router, prefix="/v1")

    def _override_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


def _article(url: str = "https://example.com/a") -> RawArticle:
    return RawArticle(
        title="SAF update",
        url=url,
        excerpt="Policy update excerpt",
        published_at=datetime.now(timezone.utc),
        source="test",
    )


def test_claude_extractor_mock_returns_valid_stub():
    extractor = ClaudeSignalExtractor(mock_mode=True)
    signals = extractor.extract(_article())

    assert len(signals) == 1
    signal = signals[0]
    assert signal.signal_type == "OTHER"
    assert signal.impact_direction == "NEUTRAL"
    assert 0.0 <= signal.confidence <= 1.0
    assert signal.claude_model == "mock"


def test_claude_extractor_real_mode_uses_cache_control(monkeypatch: pytest.MonkeyPatch):
    captured: dict = {}

    class FakeUsage:
        input_tokens = 120
        output_tokens = 80
        cache_read_input_tokens = 15

    class FakeBlock:
        text = (
            '{"signal_type":"POLICY_CHANGE","entities":["EU"],"impact_direction":"BULLISH_SAF",'
            '"confidence":0.82,"summary_en":"Policy expansion","summary_cn":"政策扩张"}'
        )
        input = None

    class FakeResponse:
        usage = FakeUsage()
        content = [FakeBlock()]
        model = "claude-sonnet-4-6"

    class FakeMessages:
        def create(self, **kwargs):
            captured.update(kwargs)
            return FakeResponse()

    class FakeAnthropic:
        def __init__(self, api_key=None):
            self.messages = FakeMessages()

    monkeypatch.setitem(sys.modules, "anthropic", types.SimpleNamespace(Anthropic=FakeAnthropic))
    extractor = ClaudeSignalExtractor(mock_mode=False, anthropic_api_key="x")
    signals = extractor.extract(_article())

    assert len(signals) == 1
    assert captured["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert signals[0].prompt_cache_hit is True
    assert signals[0].signal_type == "POLICY_CHANGE"


def test_claude_extractor_budget_exceeded(monkeypatch: pytest.MonkeyPatch):
    class FakeUsage:
        input_tokens = 200
        output_tokens = 100
        cache_read_input_tokens = 0

    class FakeBlock:
        text = (
            '{"signal_type":"OTHER","entities":[],"impact_direction":"NEUTRAL",'
            '"confidence":0.2,"summary_en":"n/a","summary_cn":"n/a"}'
        )
        input = None

    class FakeResponse:
        usage = FakeUsage()
        content = [FakeBlock()]
        model = "claude-sonnet-4-6"

    class FakeMessages:
        def create(self, **kwargs):
            return FakeResponse()

    class FakeAnthropic:
        def __init__(self, api_key=None):
            self.messages = FakeMessages()

    monkeypatch.setitem(sys.modules, "anthropic", types.SimpleNamespace(Anthropic=FakeAnthropic))
    extractor = ClaudeSignalExtractor(mock_mode=False, token_budget=100, anthropic_api_key="x")

    with pytest.raises(BudgetExceeded):
        extractor.extract(_article())


def test_claude_extractor_persists_budget_across_instances(monkeypatch: pytest.MonkeyPatch, session_factory):
    calls = {"count": 0}

    class FakeUsage:
        input_tokens = 40
        output_tokens = 20
        cache_read_input_tokens = 0

    class FakeBlock:
        text = (
            '{"signal_type":"OTHER","entities":[],"impact_direction":"NEUTRAL",'
            '"confidence":0.2,"summary_en":"n/a","summary_cn":"n/a"}'
        )
        input = None

    class FakeResponse:
        usage = FakeUsage()
        content = [FakeBlock()]
        model = "claude-sonnet-4-6"

    class FakeMessages:
        def create(self, **kwargs):
            calls["count"] += 1
            return FakeResponse()

    class FakeAnthropic:
        def __init__(self, api_key=None):
            self.messages = FakeMessages()

    monkeypatch.setitem(sys.modules, "anthropic", types.SimpleNamespace(Anthropic=FakeAnthropic))

    with session_factory() as db:
        first = ClaudeSignalExtractor(mock_mode=False, token_budget=650, anthropic_api_key="x")
        first.extract(_article("https://example.com/one"), db=db)

        second = ClaudeSignalExtractor(mock_mode=False, token_budget=650, anthropic_api_key="x")
        with pytest.raises(BudgetExceeded):
            second.extract(_article("https://example.com/two"), db=db)

        budget_row = db.get(AIResearchBudgetDay, datetime.now(timezone.utc).date().isoformat())

    assert budget_row is not None
    assert budget_row.tokens_used == 60
    assert budget_row.exhausted is True
    assert calls["count"] == 1


def test_signal_repository_upsert_dedup_by_url(session_factory):
    repo = SignalRepository()
    article = _article("https://example.com/dupe")
    with session_factory() as db:
        first = repo.persist_signals(
            db=db,
            raw_article=article,
            extracted=type(
                "E",
                (),
                {
                    "signal_type": "OTHER",
                    "entities": [],
                    "impact_direction": "NEUTRAL",
                    "confidence": 0.5,
                    "summary_en": "first",
                    "summary_cn": "first",
                    "claude_model": "mock",
                    "prompt_cache_hit": False,
                },
            )(),
        )
        second = repo.persist_signals(
            db=db,
            raw_article=article,
            extracted=type(
                "E2",
                (),
                {
                    "signal_type": "PRICE_SHOCK",
                    "entities": ["Brent"],
                    "impact_direction": "BEARISH_SAF",
                    "confidence": 0.9,
                    "summary_en": "second",
                    "summary_cn": "second",
                    "claude_model": "claude-sonnet-4-6",
                    "prompt_cache_hit": True,
                },
            )(),
        )
        rows = db.query(ESGSignal).all()

    assert first.id == second.id
    assert len(rows) == 1
    assert rows[0].signal_type == "PRICE_SHOCK"
    assert rows[0].summary_en == "second"
    assert rows[0].created_at == first.created_at
    assert rows[0].updated_at >= first.updated_at


def test_run_daily_pipeline_mock_end_to_end(monkeypatch: pytest.MonkeyPatch, session_factory):
    article1 = _article("https://example.com/1")
    article2 = _article("https://example.com/2")

    class FakeScraper:
        def fetch_recent(self):
            return [article1, article2]

    class FakeExtractor:
        def extract(self, _article, *, db=None):
            return [
                type(
                    "Sig",
                    (),
                    {
                        "signal_type": "OTHER",
                        "entities": [],
                        "impact_direction": "NEUTRAL",
                        "confidence": 0.5,
                        "summary_en": "mock",
                        "summary_cn": "mock",
                        "claude_model": "mock",
                        "prompt_cache_hit": False,
                    },
                )()
            ]

    monkeypatch.setattr("app.services.ai_research.NewsScraper", lambda: FakeScraper())
    monkeypatch.setattr("app.services.ai_research.ClaudeSignalExtractor", lambda: FakeExtractor())

    with session_factory() as db:
        result = run_daily_pipeline(db)
        count = db.query(ESGSignal).count()

    assert result == {"fetched": 2, "extracted": 2, "persisted": 2, "skipped_budget": 0}
    assert count == 2


def test_run_daily_pipeline_stops_after_budget_exhaustion(monkeypatch: pytest.MonkeyPatch, session_factory):
    articles = [
        _article("https://example.com/1"),
        _article("https://example.com/2"),
        _article("https://example.com/3"),
    ]
    seen: list[str] = []

    class FakeScraper:
        def fetch_recent(self):
            return articles

    class FakeExtractor:
        def extract(self, article, *, db=None):
            seen.append(article.url)
            if article.url == "https://example.com/2":
                raise BudgetExceeded("limit")
            return [
                type(
                    "Sig",
                    (),
                    {
                        "signal_type": "OTHER",
                        "entities": [],
                        "impact_direction": "NEUTRAL",
                        "confidence": 0.5,
                        "summary_en": "mock",
                        "summary_cn": "mock",
                        "claude_model": "mock",
                        "prompt_cache_hit": False,
                    },
                )()
            ]

    monkeypatch.setattr("app.services.ai_research.NewsScraper", lambda: FakeScraper())
    monkeypatch.setattr("app.services.ai_research.ClaudeSignalExtractor", lambda: FakeExtractor())

    with session_factory() as db:
        result = run_daily_pipeline(db)
        count = db.query(ESGSignal).count()

    assert seen == ["https://example.com/1", "https://example.com/2"]
    assert result == {"fetched": 3, "extracted": 1, "persisted": 1, "skipped_budget": 2}
    assert count == 1


def test_research_route_filters_since_limit_signal_type(client: TestClient, session_factory):
    now = datetime.now(timezone.utc)
    with session_factory() as db:
        db.add_all(
            [
                ESGSignal(
                    id=str(uuid4()),
                    created_at=now - timedelta(days=2),
                    updated_at=now - timedelta(days=2),
                    source_url="https://example.com/old",
                    signal_type="OTHER",
                    entities=[],
                    impact_direction="NEUTRAL",
                    confidence=0.4,
                    summary_en="old",
                    summary_cn="old",
                    raw_title="old",
                    raw_excerpt="old",
                    published_at=now - timedelta(days=2),
                    claude_model="mock",
                    prompt_cache_hit=False,
                ),
                ESGSignal(
                    id=str(uuid4()),
                    created_at=now - timedelta(hours=1),
                    updated_at=now - timedelta(hours=1),
                    source_url="https://example.com/new1",
                    signal_type="POLICY_CHANGE",
                    entities=["EU"],
                    impact_direction="BULLISH_SAF",
                    confidence=0.8,
                    summary_en="new1",
                    summary_cn="new1",
                    raw_title="new1",
                    raw_excerpt="new1",
                    published_at=now - timedelta(hours=1),
                    claude_model="claude-sonnet-4-6",
                    prompt_cache_hit=True,
                ),
                ESGSignal(
                    id=str(uuid4()),
                    created_at=now - timedelta(minutes=30),
                    updated_at=now - timedelta(minutes=30),
                    source_url="https://example.com/new2",
                    signal_type="PRICE_SHOCK",
                    entities=["Market"],
                    impact_direction="BEARISH_SAF",
                    confidence=0.9,
                    summary_en="new2",
                    summary_cn="new2",
                    raw_title="new2",
                    raw_excerpt="new2",
                    published_at=now - timedelta(minutes=30),
                    claude_model="claude-sonnet-4-6",
                    prompt_cache_hit=False,
                ),
            ]
        )
        db.commit()

    response = client.get(
        "/v1/research/signals",
        params={
            "since": (now - timedelta(hours=2)).isoformat(),
            "limit": 1,
            "signal_type": "POLICY_CHANGE",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["source_url"] == "https://example.com/new1"
    assert payload[0]["signal_type"] == "POLICY_CHANGE"
    assert "updated_at" in payload[0]


def test_research_route_defaults_to_recent_window(client: TestClient, session_factory):
    now = datetime.now(timezone.utc)
    with session_factory() as db:
        db.add(
            ESGSignal(
                id=str(uuid4()),
                created_at=now - timedelta(hours=1),
                updated_at=now - timedelta(hours=1),
                source_url="https://example.com/default-window",
                signal_type="OTHER",
                entities=[],
                impact_direction="NEUTRAL",
                confidence=0.6,
                summary_en="recent",
                summary_cn="recent",
                raw_title="recent",
                raw_excerpt="recent",
                published_at=now - timedelta(hours=1),
                claude_model="mock",
                prompt_cache_hit=False,
            )
        )
        db.commit()

    response = client.get("/v1/research/signals")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["source_url"] == "https://example.com/default-window"
