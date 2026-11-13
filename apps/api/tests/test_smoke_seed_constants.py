from __future__ import annotations

import re
from pathlib import Path

from app.services import market

WORKFLOW_PATH = (
    Path(__file__).resolve().parents[3] / ".github/workflows/public-smoke.yml"
)


def _workflow_seeds() -> set[float]:
    text = WORKFLOW_PATH.read_text(encoding="utf-8")
    match = re.search(r"seeds\s*=\s*\(([^)]*)\)", text)
    assert match is not None, "public-smoke.yml seeds tuple not found"
    return {float(token) for token in re.findall(r"[-+]?\d+(?:\.\d+)?", match.group(1))}


def test_smoke_seeds_match_market_defaults() -> None:
    assert _workflow_seeds() == {
        market.DEFAULT_JET_USD_PER_L,
        market.DEFAULT_EU_ETS_EUR_PER_T,
    }
