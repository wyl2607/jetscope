from datetime import datetime, timedelta, timezone

import pytest

from app.services.analysis.tipping_point import TippingPointEngine


@pytest.mark.parametrize(
    "gap, expected",
    [
        (0.01, "CROSSOVER"),
        (0.0, "CRITICAL"),
        (-0.0001, "CRITICAL"),
        (-0.049999, "CRITICAL"),
        (-0.05, "ALERT"),
        (-0.10, "ALERT"),
        (-0.199999, "ALERT"),
        (-0.20, None),
        (-0.21, None),
    ],
)
def test_event_type_for_gap_boundaries(gap: float, expected: str | None) -> None:
    assert TippingPointEngine._event_type_for_gap(gap) == expected


def test_as_utc_naive_datetime_gets_utc_tzinfo() -> None:
    naive = datetime(2026, 1, 2, 3, 4, 5)

    result = TippingPointEngine._as_utc(naive)

    assert result == datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    assert result.tzinfo == timezone.utc


def test_as_utc_aware_datetime_converts_same_instant_to_utc() -> None:
    plus_two = timezone(timedelta(hours=2))
    aware_local = datetime(2026, 1, 2, 15, 30, 0, tzinfo=plus_two)

    result = TippingPointEngine._as_utc(aware_local)

    assert result == datetime(2026, 1, 2, 13, 30, 0, tzinfo=timezone.utc)
    assert result.tzinfo == timezone.utc

