from __future__ import annotations

from pydantic import ValidationError
import pytest

from app.schemas.research import ResearchSignalResponse


def _payload() -> dict:
    return {
        "id": "signal-1",
        "created_at": "2026-06-01T10:00:00Z",
        "updated_at": "2026-06-01T10:05:00Z",
        "source_url": "https://example.com/article",
        "signal_type": "POLICY_CHANGE",
        "impact_direction": "BULLISH",
        "confidence": 0.72,
        "summary_en": "Policy support expanded.",
        "summary_cn": "政策支持扩大。",
        "raw_title": "Policy update",
        "raw_excerpt": "A policy update affecting SAF markets.",
        "published_at": "2026-06-01T09:00:00Z",
        "claude_model": "claude-sonnet-4-6",
        "prompt_cache_hit": True,
    }


def test_research_signal_response_parses_valid_payload_and_defaults_entities():
    model = ResearchSignalResponse.model_validate(_payload())

    assert model.id == "signal-1"
    assert model.signal_type == "POLICY_CHANGE"
    assert model.impact_direction == "BULLISH"
    assert model.entities == []
    assert model.created_at.tzinfo is not None


def test_research_signal_response_default_entities_are_not_shared_between_instances():
    first = ResearchSignalResponse.model_validate(_payload())
    second = ResearchSignalResponse.model_validate(_payload() | {"id": "signal-2"})

    first.entities.append("EU")

    assert first.entities == ["EU"]
    assert second.entities == []


@pytest.mark.parametrize("bad_confidence", [-0.01, 1.01])
def test_research_signal_response_rejects_confidence_out_of_range(bad_confidence: float):
    with pytest.raises(ValidationError):
        ResearchSignalResponse.model_validate(_payload() | {"confidence": bad_confidence})


def test_research_signal_response_rejects_invalid_literal_values():
    with pytest.raises(ValidationError):
        ResearchSignalResponse.model_validate(_payload() | {"signal_type": "INVALID"})

    with pytest.raises(ValidationError):
        ResearchSignalResponse.model_validate(_payload() | {"impact_direction": "UP_ONLY"})
