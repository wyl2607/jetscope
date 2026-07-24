import pytest

from app.services.analysis.crossover import (
    SpreadThresholds,
    classify_spread,
    compute_crossover,
)

LABELS = ("uneconomic", "inflection", "marginal_switch", "dominant")
THRESHOLDS = SpreadThresholds(high=25.0, mid=5.0, low=-10.0)


def test_classify_spread_matches_saf_band_boundaries() -> None:
    assert classify_spread(26.0, THRESHOLDS, LABELS) == "uneconomic"
    assert classify_spread(25.0, THRESHOLDS, LABELS) == "inflection"
    assert classify_spread(5.0, THRESHOLDS, LABELS) == "marginal_switch"
    assert classify_spread(-10.0, THRESHOLDS, LABELS) == "marginal_switch"
    assert classify_spread(-10.01, THRESHOLDS, LABELS) == "dominant"


def test_compute_crossover_gap_and_spread() -> None:
    result = compute_crossover(
        clean_cost=55.0, reference_cost=80.0, thresholds=THRESHOLDS, labels=LABELS
    )
    assert result.gap == pytest.approx(-25.0)
    assert result.spread_pct == pytest.approx(-31.25)
    assert result.status == "dominant"


@pytest.mark.parametrize("reference_cost", [0.0, -1.0, float("nan"), float("inf")])
def test_compute_crossover_rejects_invalid_reference_cost(reference_cost: float) -> None:
    with pytest.raises(ValueError, match="reference_cost"):
        compute_crossover(
            clean_cost=55.0,
            reference_cost=reference_cost,
            thresholds=THRESHOLDS,
            labels=LABELS,
        )


def test_compute_crossover_rejects_non_finite_clean_cost() -> None:
    with pytest.raises(ValueError, match="finite"):
        compute_crossover(
            clean_cost=float("nan"),
            reference_cost=80.0,
            thresholds=THRESHOLDS,
            labels=LABELS,
        )
