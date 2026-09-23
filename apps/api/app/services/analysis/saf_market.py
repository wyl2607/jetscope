"""Dated SAF purchase-price references, kept apart from production-cost bands.

PATHWAY_COSTS says what a plant might produce SAF for; a buyer pays the market.
Comparing fossil jet against the production seed alone reported HEFA as past
crossover while the EU paid about 1,925 EUR/t for SAF (EASA, 2025 average).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date

from app.services.analysis.pathway_costs import EUR_TO_USD, JET_LITRES_PER_TONNE, get_pathway_cost
from app.services.curated_events import curated_dir

# EASA: ~80 % of EU SAF supplied in 2025 was aviation biofuel, overwhelmingly
# UCO-based HEFA, so the aggregate market price stands in for HEFA only.
MARKET_REFERENCE_PATHWAY = "hefa"
PURCHASE_PRICE_KINDS = frozenset({"realized_average", "price_assessment"})


@dataclass(frozen=True, slots=True)
class SafMarketReference:
    reference_id: str
    kind: str
    region: str
    period: str
    published_at: date
    saf_eur_per_t: float
    source_name: str
    source_url: str

    @property
    def saf_usd_per_l(self) -> float:
        return self.saf_eur_per_t / JET_LITRES_PER_TONNE * EUR_TO_USD


def latest_saf_market_reference() -> SafMarketReference | None:
    path = curated_dir() / "market" / "saf_market_prices.json"
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    references = [
        SafMarketReference(
            reference_id=str(item["id"]),
            kind=str(item["kind"]),
            region=str(item["region"]),
            period=str(item["period"]),
            published_at=date.fromisoformat(str(item["published_at"])),
            saf_eur_per_t=float(item["saf_eur_per_t"]),
            source_name=str(item["source_name"]),
            source_url=str(item["source_url"]),
        )
        for item in payload.get("references", [])
        if item.get("kind") in PURCHASE_PRICE_KINDS
    ]
    return max(references, key=lambda ref: ref.published_at, default=None)


def saf_buyer_cost_usd_per_l(pathway_key: str) -> tuple[float, str]:
    """What an airline pays per litre before carbon, and on what basis."""
    reference = latest_saf_market_reference()
    if pathway_key == MARKET_REFERENCE_PATHWAY and reference is not None:
        return reference.saf_usd_per_l, "market_reference"
    return get_pathway_cost(pathway_key).midpoint_usd_per_l, "production_cost"
