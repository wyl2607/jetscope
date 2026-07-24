"""Domain-agnostic cost-crossover core.

Shared by the SAF tipping-point analysis and the grid-parity analysis: both
compare a clean-option cost against a fossil reference cost and classify the
percentage spread into the same four bands.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite


@dataclass(frozen=True, slots=True)
class SpreadThresholds:
    """Percentage cut points between the four crossover bands.

    The comparison semantics intentionally match the original SAF logic:
    ``> high`` and ``> mid`` are exclusive, while the marginal/dominant edge
    is inclusive (``>= low``).
    """

    high: float
    mid: float
    low: float


@dataclass(frozen=True, slots=True)
class CrossoverResult:
    clean_cost: float
    reference_cost: float
    gap: float
    spread_pct: float
    status: str


def classify_spread(
    spread_pct: float,
    thresholds: SpreadThresholds,
    labels: tuple[str, str, str, str],
) -> str:
    if spread_pct > thresholds.high:
        return labels[0]
    if spread_pct > thresholds.mid:
        return labels[1]
    if spread_pct >= thresholds.low:
        return labels[2]
    return labels[3]


def compute_crossover(
    *,
    clean_cost: float,
    reference_cost: float,
    thresholds: SpreadThresholds,
    labels: tuple[str, str, str, str],
) -> CrossoverResult:
    if not isfinite(clean_cost) or not isfinite(reference_cost):
        raise ValueError("clean_cost and reference_cost must be finite")
    if reference_cost <= 0:
        raise ValueError("reference_cost must be greater than zero")
    gap = clean_cost - reference_cost
    spread_pct = (gap / reference_cost) * 100.0
    return CrossoverResult(
        clean_cost=clean_cost,
        reference_cost=reference_cost,
        gap=gap,
        spread_pct=spread_pct,
        status=classify_spread(spread_pct, thresholds, labels),
    )
