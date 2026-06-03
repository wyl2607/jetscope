"""Unit tests for app.schemas.research (ResearchSignalResponse)."""

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas.research import (
    ResearchImpactDirection,
    ResearchSignalResponse,
    ResearchSignalType,
)


def test_valid_signal_roundtrip():
    """Create a full ResearchSignalResponse and dump/load back."""
    data = {
        "id": "sig_01j",
        "created_at": datetime(2026, 6, 1, 12, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 6, 2, 8, 30, 0, tzinfo=timezone.utc),
        "source_url": "https://example.com/news/oil-supply",
        "signal_type": "SUPPLY_DISRUPTION",
        "entities": ["OPEC", "Saudi Arabia"],
        "impact_direction": "BULLISH_SAF",
        "confidence": 0.87,
        "summary_en": "Supply disruption expected due to OPEC cuts.",
        "summary_cn": "由于OPEC减产，预计供应中断。",
        "raw_title": "OPEC Announces Production Cuts",
        "raw_excerpt": "OPEC has announced a significant reduction in output...",
        "published_at": datetime(2026, 6, 1, 10, 0, 0, tzinfo=timezone.utc),
        "claude_model": "claude-3-5-sonnet-20241022",
        "prompt_cache_hit": False,
    }

    obj = ResearchSignalResponse(**data)
    dumped = obj.model_dump(mode="python")

    assert dumped["id"] == "sig_01j"
    assert dumped["signal_type"] == "SUPPLY_DISRUPTION"
    assert dumped["impact_direction"] == "BULLISH_SAF"
    assert dumped["confidence"] == 0.87
    assert dumped["entities"] == ["OPEC", "Saudi Arabia"]
    assert dumped["prompt_cache_hit"] is False
    assert dumped["summary_cn"] == "由于OPEC减产，预计供应中断。"


def test_entities_defaults_to_empty_list():
    """entities field should default to [] when not provided."""
    obj = ResearchSignalResponse(
        id="sig_02j",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        source_url="https://example.com",
        signal_type="POLICY_CHANGE",
        impact_direction="NEUTRAL",
        confidence=0.5,
        summary_en="Test",
        summary_cn="测试",
        raw_title="Test",
        raw_excerpt="Test excerpt",
        published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        claude_model="claude-3-haiku-20240307",
        prompt_cache_hit=False,
    )
    assert obj.entities == []


@pytest.mark.parametrize(
    "signal_type",
    ["SUPPLY_DISRUPTION", "POLICY_CHANGE", "PRICE_SHOCK", "CAPACITY_ANNOUNCEMENT", "OTHER"],
)
def test_all_signal_types_accepted(signal_type):
    """Each literal value in ResearchSignalType should be accepted."""
    obj = ResearchSignalResponse(
        id="sig_type",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        source_url="https://example.com",
        signal_type=signal_type,
        impact_direction="NEUTRAL",
        confidence=0.5,
        summary_en="Test",
        summary_cn="测试",
        raw_title="Test",
        raw_excerpt="Test",
        published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        claude_model="claude-3-haiku-20240307",
        prompt_cache_hit=False,
    )
    assert obj.signal_type == signal_type


@pytest.mark.parametrize(
    "direction",
    ["BEARISH_SAF", "BULLISH_SAF", "NEUTRAL"],
)
def test_all_impact_directions_accepted(direction):
    """Each literal value in ResearchImpactDirection should be accepted."""
    obj = ResearchSignalResponse(
        id="sig_dir",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        source_url="https://example.com",
        signal_type="OTHER",
        impact_direction=direction,
        confidence=0.5,
        summary_en="Test",
        summary_cn="测试",
        raw_title="Test",
        raw_excerpt="Test",
        published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        claude_model="claude-3-haiku-20240307",
        prompt_cache_hit=False,
    )
    assert obj.impact_direction == direction


def test_invalid_signal_type_raises():
    """An unrecognised signal_type string should raise ValidationError."""
    with pytest.raises(ValidationError):
        ResearchSignalResponse(
            id="sig_bad",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            source_url="https://example.com",
            signal_type="INVALID_TYPE",
            impact_direction="NEUTRAL",
            confidence=0.5,
            summary_en="Test",
            summary_cn="测试",
            raw_title="Test",
            raw_excerpt="Test",
            published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            claude_model="claude-3-haiku-20240307",
            prompt_cache_hit=False,
        )


def test_invalid_impact_direction_raises():
    """An unrecognised impact_direction string should raise ValidationError."""
    with pytest.raises(ValidationError):
        ResearchSignalResponse(
            id="sig_bad2",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            source_url="https://example.com",
            signal_type="OTHER",
            impact_direction="MOONISH",
            confidence=0.5,
            summary_en="Test",
            summary_cn="测试",
            raw_title="Test",
            raw_excerpt="Test",
            published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            claude_model="claude-3-haiku-20240307",
            prompt_cache_hit=False,
        )


@pytest.mark.parametrize("bad_conf", [-0.01, 1.01, 42])
def test_confidence_out_of_range_raises(bad_conf):
    """Confidence must be in [0, 1]; values outside should raise."""
    with pytest.raises(ValidationError):
        ResearchSignalResponse(
            id="sig_conf",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            source_url="https://example.com",
            signal_type="PRICE_SHOCK",
            impact_direction="BEARISH_SAF",
            confidence=bad_conf,
            summary_en="Test",
            summary_cn="测试",
            raw_title="Test",
            raw_excerpt="Test",
            published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            claude_model="claude-3-haiku-20240307",
            prompt_cache_hit=False,
        )


@pytest.mark.parametrize("good_conf", [0.0, 0.5, 1.0])
def test_confidence_boundaries_accepted(good_conf):
    """Confidence boundary values 0.0 and 1.0 should be accepted."""
    obj = ResearchSignalResponse(
        id="sig_conf2",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        source_url="https://example.com",
        signal_type="CAPACITY_ANNOUNCEMENT",
        impact_direction="BULLISH_SAF",
        confidence=good_conf,
        summary_en="Test",
        summary_cn="测试",
        raw_title="Test",
        raw_excerpt="Test",
        published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        claude_model="claude-3-haiku-20240307",
        prompt_cache_hit=False,
    )
    assert obj.confidence == good_conf


def test_json_roundtrip():
    """Serialising to JSON and back should preserve all fields."""
    data = {
        "id": "sig_json",
        "created_at": "2026-06-01T12:00:00Z",
        "updated_at": "2026-06-02T08:30:00Z",
        "source_url": "https://example.com/article",
        "signal_type": "PRICE_SHOCK",
        "entities": ["Brent", "WTI"],
        "impact_direction": "BEARISH_SAF",
        "confidence": 0.95,
        "summary_en": "Oil price shock expected.",
        "summary_cn": "预计油价冲击。",
        "raw_title": "Oil Prices Spike",
        "raw_excerpt": "Crude oil prices surged...",
        "published_at": "2026-06-01T10:00:00Z",
        "claude_model": "claude-3-5-sonnet-20241022",
        "prompt_cache_hit": True,
    }

    obj = ResearchSignalResponse.model_validate(data)
    assert obj.id == "sig_json"
    assert obj.signal_type == "PRICE_SHOCK"
    assert obj.confidence == 0.95
    assert obj.prompt_cache_hit is True

    restored = ResearchSignalResponse.model_validate_json(obj.model_dump_json())
    assert restored.id == obj.id
    assert restored.signal_type == obj.signal_type
    assert restored.confidence == obj.confidence
    assert restored.entities == obj.entities
    assert restored.prompt_cache_hit == obj.prompt_cache_hit
