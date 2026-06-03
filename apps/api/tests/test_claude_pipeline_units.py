from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

from app.services.ai_research.claude_pipeline import (
    ALLOWED_IMPACT_DIRECTIONS,
    ALLOWED_SIGNAL_TYPES,
    BudgetExceeded,
    ClaudeSignalExtractor,
    DEFAULT_MODEL,
    ExtractedSignal,
)
from app.services.ai_research.scraper import RawArticle


# ---------------------------------------------------------------------------
# ExtractedSignal dataclass
# ---------------------------------------------------------------------------

def test_extracted_signal_constructs_with_minimal_args() -> None:
    signal = ExtractedSignal(
        signal_type="PRICE_SHOCK",
        entities=["Brent", "WTI"],
        impact_direction="BEARISH_SAF",
        confidence=0.85,
        summary_en="Price drop",
        summary_cn="价格下跌",
        claude_model="claude-sonnet-4-6",
        prompt_cache_hit=False,
    )
    assert signal.signal_type == "PRICE_SHOCK"
    assert signal.entities == ["Brent", "WTI"]
    assert signal.impact_direction == "BEARISH_SAF"
    assert signal.confidence == 0.85
    assert signal.tokens_used == 0


def test_extracted_signal_defaults_tokens_used_zero() -> None:
    signal = ExtractedSignal(
        signal_type="OTHER",
        entities=[],
        impact_direction="NEUTRAL",
        confidence=0.5,
        summary_en="x",
        summary_cn="x",
        claude_model="mock",
        prompt_cache_hit=False,
    )
    assert signal.tokens_used == 0


# ---------------------------------------------------------------------------
# BudgetExceeded
# ---------------------------------------------------------------------------

def test_budget_exceeded_is_runtime_error() -> None:
    exc = BudgetExceeded("daily limit")
    assert isinstance(exc, RuntimeError)
    assert "daily limit" in str(exc)


# ---------------------------------------------------------------------------
# Constructor
# ---------------------------------------------------------------------------

class TestConstructor:
    def test_default_mock_mode_from_settings(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("app.services.ai_research.claude_pipeline.settings.ai_research_mock_mode", True)
        extractor = ClaudeSignalExtractor()
        assert extractor._mock_mode is True

    def test_override_mock_mode(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("app.services.ai_research.claude_pipeline.settings.ai_research_mock_mode", True)
        extractor = ClaudeSignalExtractor(mock_mode=False, anthropic_api_key="sk-test")
        assert extractor._mock_mode is False
        assert extractor._client is not None

    def test_override_token_budget(self) -> None:
        extractor = ClaudeSignalExtractor(mock_mode=True, token_budget=9999)
        assert extractor._token_budget == 9999

    def test_override_model(self) -> None:
        extractor = ClaudeSignalExtractor(mock_mode=True, model="claude-opus-4-6")
        assert extractor._model == "claude-opus-4-6"

    def test_default_model(self) -> None:
        extractor = ClaudeSignalExtractor(mock_mode=True)
        assert extractor._model == DEFAULT_MODEL


# ---------------------------------------------------------------------------
# _normalize_entities (static)
# ---------------------------------------------------------------------------

class TestNormalizeEntities:
    def test_list_of_strings(self) -> None:
        assert ClaudeSignalExtractor._normalize_entities(["EU", "SAF"]) == ["EU", "SAF"]

    def test_empty_list(self) -> None:
        assert ClaudeSignalExtractor._normalize_entities([]) == []

    def test_none_becomes_empty(self) -> None:
        assert ClaudeSignalExtractor._normalize_entities(None) == []

    def test_non_list_becomes_empty(self) -> None:
        assert ClaudeSignalExtractor._normalize_entities("EU") == []

    def test_whitespace_items_removed(self) -> None:
        assert ClaudeSignalExtractor._normalize_entities(["EU", "  ", "", "SAF"]) == ["EU", "SAF"]

    def test_non_string_items_cast(self) -> None:
        assert ClaudeSignalExtractor._normalize_entities([42, 3.14]) == ["42", "3.14"]


# ---------------------------------------------------------------------------
# _normalize_signal_type (static)
# ---------------------------------------------------------------------------

class TestNormalizeSignalType:
    def test_valid_type_passes(self) -> None:
        for t in ALLOWED_SIGNAL_TYPES:
            assert ClaudeSignalExtractor._normalize_signal_type(t) == t

    def test_lowercase_normalized(self) -> None:
        assert ClaudeSignalExtractor._normalize_signal_type("policy_change") == "POLICY_CHANGE"

    def test_unknown_falls_back_to_other(self) -> None:
        assert ClaudeSignalExtractor._normalize_signal_type("REGULATORY_SHIFT") == "OTHER"

    def test_none_falls_back_to_other(self) -> None:
        assert ClaudeSignalExtractor._normalize_signal_type(None) == "OTHER"


# ---------------------------------------------------------------------------
# _normalize_impact_direction (static)
# ---------------------------------------------------------------------------

class TestNormalizeImpactDirection:
    def test_valid_direction_passes(self) -> None:
        for d in ALLOWED_IMPACT_DIRECTIONS:
            assert ClaudeSignalExtractor._normalize_impact_direction(d) == d

    def test_lowercase_normalized(self) -> None:
        assert ClaudeSignalExtractor._normalize_impact_direction("bearish_saf") == "BEARISH_SAF"

    def test_unknown_falls_back_to_neutral(self) -> None:
        assert ClaudeSignalExtractor._normalize_impact_direction("VERY_BULLISH") == "NEUTRAL"

    def test_none_falls_back_to_neutral(self) -> None:
        assert ClaudeSignalExtractor._normalize_impact_direction(None) == "NEUTRAL"


# ---------------------------------------------------------------------------
# _normalize_confidence (static)
# ---------------------------------------------------------------------------

class TestNormalizeConfidence:
    def test_valid_float(self) -> None:
        assert ClaudeSignalExtractor._normalize_confidence(0.75) == 0.75

    def test_zero(self) -> None:
        assert ClaudeSignalExtractor._normalize_confidence(0.0) == 0.0

    def test_one(self) -> None:
        assert ClaudeSignalExtractor._normalize_confidence(1.0) == 1.0

    def test_below_zero_clamped(self) -> None:
        assert ClaudeSignalExtractor._normalize_confidence(-0.5) == 0.0

    def test_above_one_clamped(self) -> None:
        assert ClaudeSignalExtractor._normalize_confidence(1.5) == 1.0

    def test_none_returns_default(self) -> None:
        assert ClaudeSignalExtractor._normalize_confidence(None) == 0.5

    def test_string_parsed(self) -> None:
        assert ClaudeSignalExtractor._normalize_confidence("0.82") == 0.82

    def test_bad_string_returns_default(self) -> None:
        assert ClaudeSignalExtractor._normalize_confidence("n/a") == 0.5


# ---------------------------------------------------------------------------
# _estimate_request_tokens (static)
# ---------------------------------------------------------------------------

class TestEstimateRequestTokens:
    def test_short_article(self) -> None:
        article = RawArticle(
            title="SAF",
            url="https://x.com/a",
            excerpt="Short.",
            published_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            source="test",
        )
        tokens = ClaudeSignalExtractor._estimate_request_tokens(article)
        # estimated_input = len(payload)//4, then + 600
        assert tokens >= 600
        assert isinstance(tokens, int)

    def test_long_article_has_higher_estimate(self) -> None:
        short = RawArticle(
            title="A",
            url="https://x.com/a",
            excerpt="X",
            published_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            source="test",
        )
        long = RawArticle(
            title="A" * 100,
            url="https://x.com/b",
            excerpt="Y" * 500,
            published_at=datetime(2025, 1, 2, tzinfo=timezone.utc),
            source="test",
        )
        assert (
            ClaudeSignalExtractor._estimate_request_tokens(long)
            > ClaudeSignalExtractor._estimate_request_tokens(short)
        )


# ---------------------------------------------------------------------------
# _current_day (static)
# ---------------------------------------------------------------------------

class TestCurrentDay:
    def test_returns_iso_date_string(self) -> None:
        day = ClaudeSignalExtractor._current_day()
        assert len(day) == 10  # YYYY-MM-DD
        assert "-" in day
        assert day == datetime.now(timezone.utc).date().isoformat()


# ---------------------------------------------------------------------------
# _reset_budget_if_new_day / tokens_today property
# ---------------------------------------------------------------------------

class TestBudgetReset:
    def test_tokens_today_starts_zero(self) -> None:
        extractor = ClaudeSignalExtractor(mock_mode=True)
        assert extractor.tokens_today == 0

    def test_tokens_today_reflects_in_memory_usage(self) -> None:
        extractor = ClaudeSignalExtractor(mock_mode=True)
        extractor._tokens_today = 500
        assert extractor.tokens_today == 500

    def test_reset_on_new_day(self, monkeypatch: pytest.MonkeyPatch) -> None:
        extractor = ClaudeSignalExtractor(mock_mode=True)
        extractor._budget_day = "2099-01-01"  # force a "past" day
        extractor._tokens_today = 999
        assert extractor.tokens_today == 0  # triggers reset
        assert extractor._budget_day != "2099-01-01"


# ---------------------------------------------------------------------------
# _parse_signal_payload
# ---------------------------------------------------------------------------

class TestParseSignalPayload:
    @pytest.fixture
    def extractor(self) -> ClaudeSignalExtractor:
        return ClaudeSignalExtractor(mock_mode=True)

    @staticmethod
    def _make_response(*, text: str | None = None, input_payload: dict | None = None) -> Any:
        class FakeContent:
            def __init__(self) -> None:
                self.text = text
                self.input = input_payload

        class FakeResponse:
            content = [FakeContent()]

        return FakeResponse()

    def test_parses_json_text(self, extractor: ClaudeSignalExtractor) -> None:
        resp = self._make_response(
            text='{"signal_type":"POLICY_CHANGE","entities":["EU"],"impact_direction":"BULLISH_SAF","confidence":0.8,"summary_en":"x","summary_cn":"x"}'
        )
        result = extractor._parse_signal_payload(resp)
        assert result["signal_type"] == "POLICY_CHANGE"
        assert result["entities"] == ["EU"]

    def test_returns_input_dict_when_present(self, extractor: ClaudeSignalExtractor) -> None:
        payload = {"signal_type": "PRICE_SHOCK", "entities": ["Oil"]}
        resp = self._make_response(input_payload=payload, text="ignored")
        result = extractor._parse_signal_payload(resp)
        assert result is payload

    def test_empty_content_returns_empty_dict(self, extractor: ClaudeSignalExtractor) -> None:
        class EmptyResponse:
            content = []

        assert extractor._parse_signal_payload(EmptyResponse()) == {}

    def test_missing_content_returns_empty_dict(self, extractor: ClaudeSignalExtractor) -> None:
        class NoContentResponse:
            content = None

        assert extractor._parse_signal_payload(NoContentResponse()) == {}

    def test_empty_text_returns_empty_dict(self, extractor: ClaudeSignalExtractor) -> None:
        resp = self._make_response(text="")
        assert extractor._parse_signal_payload(resp) == {}

    def test_bad_json_returns_empty_dict(self, extractor: ClaudeSignalExtractor) -> None:
        resp = self._make_response(text="not json at all")
        assert extractor._parse_signal_payload(resp) == {}

    def test_json_array_returns_empty_dict(self, extractor: ClaudeSignalExtractor) -> None:
        resp = self._make_response(text='[1, 2, 3]')
        assert extractor._parse_signal_payload(resp) == {}


# ---------------------------------------------------------------------------
# Mock-mode extract
# ---------------------------------------------------------------------------

class TestMockExtract:
    def test_returns_stable_signal(self) -> None:
        extractor = ClaudeSignalExtractor(mock_mode=True)
        article = RawArticle(
            title="Test SAF news",
            url="https://example.com/test",
            excerpt="Some excerpt",
            published_at=datetime.now(timezone.utc),
            source="test",
        )
        signals = extractor.extract(article)
        assert len(signals) == 1
        s = signals[0]
        assert s.signal_type == "OTHER"
        assert s.impact_direction == "NEUTRAL"
        assert s.confidence == 0.5
        assert s.claude_model == "mock"
        assert s.prompt_cache_hit is False
        assert s.tokens_used == 0
        assert "Test SAF news" in s.summary_en

    def test_skips_budget_check_when_mocked(self) -> None:
        extractor = ClaudeSignalExtractor(mock_mode=True, token_budget=1)
        article = RawArticle(
            title="Budget test",
            url="https://example.com/budget",
            excerpt="",
            published_at=datetime.now(timezone.utc),
            source="test",
        )
        # Should NOT raise BudgetExceeded even with tiny budget
        signals = extractor.extract(article)
        assert len(signals) == 1
