from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys
import types

import pytest

# Keep these focused unit tests independent of the backend's DB/settings stack.
# The target module is still imported and exercised directly below.
sys.modules.setdefault(
    "sqlalchemy",
    types.SimpleNamespace(orm=types.SimpleNamespace(Session=object)),
)
sys.modules.setdefault("sqlalchemy.orm", types.SimpleNamespace(Session=object))
sys.modules.setdefault(
    "app.core.config",
    types.SimpleNamespace(
        settings=types.SimpleNamespace(
            ai_research_mock_mode=True,
            ai_research_daily_token_budget=500000,
            anthropic_api_key="",
            newsapi_key="",
        )
    ),
)
sys.modules.setdefault(
    "app.services.ai_research.budget",
    types.SimpleNamespace(BudgetStateRepository=lambda: types.SimpleNamespace()),
)
ai_research_package = types.ModuleType("app.services.ai_research")
ai_research_package.__path__ = [str(Path(__file__).resolve().parents[1] / "app/services/ai_research")]
sys.modules.setdefault("app.services.ai_research", ai_research_package)

from app.services.ai_research.claude_pipeline import BudgetExceeded, ClaudeSignalExtractor
from app.services.ai_research.scraper import RawArticle


def _article(*, title: str = "SAF policy update", excerpt: str = "EU mandate expands.") -> RawArticle:
    return RawArticle(
        title=title,
        url="https://example.com/saf-policy-update",
        excerpt=excerpt,
        published_at=datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc),
        source="unit-test",
    )


def test_mock_mode_returns_deterministic_signal_without_external_client() -> None:
    extractor = ClaudeSignalExtractor(mock_mode=True)

    signals = extractor.extract(_article(title="Mandate expands"))

    assert len(signals) == 1
    assert signals[0].signal_type == "OTHER"
    assert signals[0].impact_direction == "NEUTRAL"
    assert signals[0].summary_en == "Mock signal extracted for: Mandate expands"
    assert signals[0].summary_cn == "模拟信号：Mandate expands"
    assert signals[0].claude_model == "mock"
    assert signals[0].tokens_used == 0
    assert extractor.tokens_today == 0


def test_normalizers_clamp_invalid_model_payload_values() -> None:
    assert ClaudeSignalExtractor._normalize_signal_type(" policy_change ") == "POLICY_CHANGE"
    assert ClaudeSignalExtractor._normalize_signal_type("not-a-type") == "OTHER"
    assert ClaudeSignalExtractor._normalize_impact_direction(" bullish ") == "BULLISH"
    assert ClaudeSignalExtractor._normalize_impact_direction(None) == "NEUTRAL"
    assert ClaudeSignalExtractor._normalize_confidence("1.7") == 1.0
    assert ClaudeSignalExtractor._normalize_confidence("bad") == 0.5
    assert ClaudeSignalExtractor._normalize_entities([" EU ", "", 42, None]) == ["EU", "42", "None"]


def test_real_mode_parses_json_text_and_tracks_tokens(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeUsage:
        input_tokens = 17
        output_tokens = 5
        cache_read_input_tokens = 3

    class FakeBlock:
        input = None
        text = (
            '{"signal_type":"PRICE_SHOCK","entities":[" Neste ","EU"],'
            '"impact_direction":"BEARISH","confidence":"0.77",'
            '"summary_en":"Prices jumped","summary_cn":"价格上涨"}'
        )

    class FakeResponse:
        usage = FakeUsage()
        content = [FakeBlock()]
        model = "fake-claude"

    class FakeMessages:
        def create(self, **kwargs: object) -> FakeResponse:
            captured.update(kwargs)
            return FakeResponse()

    class FakeAnthropic:
        def __init__(self, api_key: str | None = None) -> None:
            self.api_key = api_key
            self.messages = FakeMessages()

    monkeypatch.setitem(sys.modules, "anthropic", types.SimpleNamespace(Anthropic=FakeAnthropic))

    extractor = ClaudeSignalExtractor(mock_mode=False, token_budget=100, anthropic_api_key="test-key")
    signals = extractor.extract(_article())

    assert captured["model"] == "claude-sonnet-4-6"
    assert captured["max_tokens"] == 600
    assert captured["system"][0]["cache_control"] == {"type": "ephemeral"}  # type: ignore[index]
    assert "Title: SAF policy update" in captured["messages"][0]["content"]  # type: ignore[index]
    assert len(signals) == 1
    assert signals[0].signal_type == "PRICE_SHOCK"
    assert signals[0].entities == ["Neste", "EU"]
    assert signals[0].impact_direction == "BEARISH"
    assert signals[0].confidence == pytest.approx(0.77)
    assert signals[0].prompt_cache_hit is True
    assert signals[0].tokens_used == 22
    assert extractor.tokens_today == 22


def test_real_mode_raises_when_response_usage_exceeds_in_memory_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeUsage:
        input_tokens = 70
        output_tokens = 40
        cache_read_input_tokens = 0

    class FakeBlock:
        input = None
        text = '{"signal_type":"OTHER","impact_direction":"NEUTRAL","confidence":0.2}'

    class FakeResponse:
        usage = FakeUsage()
        content = [FakeBlock()]
        model = "fake-claude"

    class FakeMessages:
        def create(self, **kwargs: object) -> FakeResponse:
            return FakeResponse()

    class FakeAnthropic:
        def __init__(self, api_key: str | None = None) -> None:
            self.messages = FakeMessages()

    monkeypatch.setitem(sys.modules, "anthropic", types.SimpleNamespace(Anthropic=FakeAnthropic))

    extractor = ClaudeSignalExtractor(mock_mode=False, token_budget=100, anthropic_api_key="test-key")

    with pytest.raises(BudgetExceeded, match="daily token budget exceeded"):
        extractor.extract(_article())

    assert extractor.tokens_today == 0


def test_parse_signal_payload_prefers_structured_input_over_text() -> None:
    extractor = ClaudeSignalExtractor(mock_mode=True)
    block = types.SimpleNamespace(
        input={"signal_type": "CAPACITY_ANNOUNCEMENT", "confidence": 0.9},
        text='{"signal_type":"OTHER"}',
    )
    response = types.SimpleNamespace(content=[block])

    parsed = extractor._parse_signal_payload(response)

    assert parsed == {"signal_type": "CAPACITY_ANNOUNCEMENT", "confidence": 0.9}
