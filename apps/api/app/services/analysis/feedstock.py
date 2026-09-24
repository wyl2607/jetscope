"""Waste-lipid feedstock squeeze: where UCO sits against last year and against gasoil.

Three transparent readings instead of a weighted score: UCO against its own
prior-year range (same assessment), UCO over gasoil in the same week, and the
EU's structural dependence on imported UCO-HEFA (EASA).
"""

from __future__ import annotations

import json
from datetime import date

from app.services.curated_events import curated_dir

STALE_AFTER_DAYS = 30


def _mid(band: dict) -> float:
    return (float(band["low"]) + float(band["high"])) / 2.0


def load_feedstock_prices() -> dict | None:
    path = curated_dir() / "market" / "feedstock_prices.json"
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def summarize_feedstock(data: dict, today: date) -> dict:
    latest = max(data["observations"], key=lambda item: item["week_ending"])
    week = date.fromisoformat(latest["week_ending"])
    ranges = [item for item in data["annual_ranges"] if item["year"] < week.year]
    baseline = max(ranges, key=lambda item: item["year"]) if ranges else None

    uco_mid = _mid(latest["uco_ddp_nwe_eur_per_t"])
    uco = {
        "week_ending": week,
        "published_at": latest["published_at"],
        "ddp_nwe_eur_per_t": uco_mid,
        "ddp_nwe_low_eur_per_t": float(latest["uco_ddp_nwe_eur_per_t"]["low"]),
        "ddp_nwe_high_eur_per_t": float(latest["uco_ddp_nwe_eur_per_t"]["high"]),
        "age_days": (today - week).days,
        "stale": (today - week).days > STALE_AFTER_DAYS,
        "source_name": latest["source_name"],
        "source_url": latest["source_url"],
        "prior_year": None,
    }
    if baseline is not None:
        band = baseline["uco_ddp_nwe_eur_per_t"]
        uco["prior_year"] = {
            "year": baseline["year"],
            "low_eur_per_t": float(band["low"]),
            "low_date": band["low_date"],
            "high_eur_per_t": float(band["high"]),
            "high_date": band["high_date"],
            "vs_high_pct": round((uco_mid / float(band["high"]) - 1) * 100, 1),
            "vs_low_pct": round((uco_mid / float(band["low"]) - 1) * 100, 1),
            "source_name": baseline["source_name"],
            "source_url": baseline["source_url"],
        }

    uco_bulk = _mid(latest["uco_cif_ara_bulk_usd_per_t"])
    gasoil = float(latest["ice_gasoil_usd_per_t"])
    return {
        "uco": uco,
        "uco_vs_gasoil": {
            "week_ending": week,
            "uco_cif_ara_bulk_usd_per_t": uco_bulk,
            "ice_gasoil_usd_per_t": gasoil,
            "ratio": round(uco_bulk / gasoil, 2),
        },
        "structure": data["structure"],
    }
