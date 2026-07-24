from __future__ import annotations

from datetime import datetime, timezone
import sys
import types

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.tables import AIResearchBudgetDay
from app.services.ai_research.claude_pipeline import BudgetExceeded, ClaudeSignalExtractor
from app.services.ai_research.scraper import RawArticle


def _article(url: str = "https://example.com/a") -> RawArticle:
    return RawArticle(
        title="SAF update",
        url=url,
        excerpt="Policy update excerpt",
        published_at=datetime.now(timezone.utc),
        source="test",
    )


def test_mock_mode_is_deterministic_and_key_free(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    class GuardAnthropic:
        def __init__(self, api_key=None, **kwargs):
            raise AssertionError("Anthropic client must not initialize in mock mode")

    monkeypatch.setitem(sys.modules, "anthropic", types.SimpleNamespace(Anthropic=GuardAnthropic))

    article = _article("https://example.com/deterministic")
    first = ClaudeSignalExtractor(mock_mode=True).extract(article)[0]
    second = ClaudeSignalExtractor(mock_mode=True).extract(article)[0]

    assert first.signal_type == "OTHER"
    assert first.impact_direction == "NEUTRAL"
    assert first.confidence == 0.5
    assert first.prompt_cache_hit is False
    assert first.tokens_used == 0
    assert first.claude_model == "mock"
    assert first.summary_en == second.summary_en
    assert first.summary_cn == second.summary_cn


def test_live_mode_is_explicit_and_db_budget_guarded(monkeypatch: pytest.MonkeyPatch, tmp_path):
    calls = {"count": 0}

    class FakeMessages:
        def create(self, **kwargs):
            calls["count"] += 1
            raise AssertionError("DB-backed budget guard should refuse before live API call")

    class FakeAnthropic:
        def __init__(self, api_key=None, **kwargs):
            self.messages = FakeMessages()

    monkeypatch.setitem(sys.modules, "anthropic", types.SimpleNamespace(Anthropic=FakeAnthropic))
    engine = create_engine(f"sqlite:///{tmp_path/'ai_boundary.sqlite3'}", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    extractor = ClaudeSignalExtractor(mock_mode=False, token_budget=100, anthropic_api_key="explicit-key")
    with SessionLocal() as db:
        with pytest.raises(BudgetExceeded, match="budget"):
            extractor.extract(_article("https://example.com/live"), db=db)
        budget_row = db.get(AIResearchBudgetDay, datetime.now(timezone.utc).date().isoformat())

    assert calls["count"] == 0
    assert budget_row is not None
    assert budget_row.exhausted is True
