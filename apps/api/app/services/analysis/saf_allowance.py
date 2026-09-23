"""EU ETS SAF allowances: statutory share of the remaining SAF-vs-kerosene gap.

Directive 2003/87/EC Art. 3c(6) reserves up to 20 M allowances (2024-2030) to
cover 50 / 70 / 95 / 100 % of the price differential left after the carbon-price
incentive. Support is paid ex post, in allowances, and scaled down uniformly
when oversubscribed, so it is a scenario toggle, not part of the default view.
"""

from __future__ import annotations

import json
from typing import Literal

from app.services.curated_events import curated_dir

SafAllowanceMode = Literal["none", "statutory", "remote_airport"]


def load_saf_allowance_rules() -> dict | None:
    path = curated_dir() / "market" / "eu_ets_saf_allowances.json"
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def coverage_pct(rules: dict | None, mode: SafAllowanceMode, pathway_key: str) -> float:
    if rules is None or mode == "none":
        return 0.0
    rates = rules["rates_pct"]
    if mode == "remote_airport":
        return float(rates["remote_airport"])
    category = rules["pathway_categories"].get(pathway_key, {}).get("category", "other")
    return float(rates[category])


def allowance_support_usd_per_l(saf_cost_usd_per_l: float, fossil_usd_per_l: float, pct: float) -> float:
    """Share of the positive remaining gap; a SAF already cheaper gets nothing."""
    return max(0.0, saf_cost_usd_per_l - fossil_usd_per_l) * pct / 100.0
