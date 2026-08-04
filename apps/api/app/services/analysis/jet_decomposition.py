"""Derive jet-vs-Brent decomposition from observed prices only.

No market levels are invented here. Callers must supply measured/seeded
Brent and jet values already present in the market snapshot.
"""

from __future__ import annotations

LITERS_PER_BARREL = 158.987294928
# Documented fallback multiplier used only when ARA quote is unavailable.
FIXED_EU_PROXY_MULTIPLIER = 1.20


def compute_jet_brent_decomposition(
    brent_usd_per_bbl: float,
    jet_usd_per_l: float,
    *,
    jet_source: str = "unknown",
) -> dict[str, float | str]:
    """Return pure arithmetic decomposition.

    spread = jet_usd_per_l - brent_usd_per_bbl / liters_per_barrel
    multiplier = jet_usd_per_l / (brent_usd_per_bbl / liters_per_barrel)
    """
    if brent_usd_per_bbl <= 0:
        raise ValueError("brent_usd_per_bbl must be > 0")
    if jet_usd_per_l <= 0:
        raise ValueError("jet_usd_per_l must be > 0")

    brent_usd_per_l = brent_usd_per_bbl / LITERS_PER_BARREL
    spread = jet_usd_per_l - brent_usd_per_l
    multiplier = jet_usd_per_l / brent_usd_per_l

    return {
        "brent_usd_per_bbl": round(float(brent_usd_per_bbl), 4),
        "brent_usd_per_l": round(float(brent_usd_per_l), 4),
        "jet_usd_per_l": round(float(jet_usd_per_l), 4),
        "jet_vs_brent_spread_usd_per_l": round(float(spread), 4),
        "jet_vs_brent_multiplier": round(float(multiplier), 4),
        "fixed_eu_proxy_multiplier": FIXED_EU_PROXY_MULTIPLIER,
        "jet_source": jet_source,
        "method": "jet_usd_per_l - brent_usd_per_bbl/158.987294928",
    }
