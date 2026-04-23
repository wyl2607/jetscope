#!/usr/bin/env python3
"""
JetScope Market Data Fetcher
Fetches free market data from public APIs and updates the SQLite database.

Data sources:
- Brent Crude Oil: Yahoo Finance (BZ=F)
- EU ETS Carbon Price: Free API endpoint
- Jet Fuel (Rotterdam): Estimated from Brent + crack spread
- SAF Price: Estimated from Jet Fuel + SAF premium
- EUR/USD: Yahoo Finance (EURUSD=X)

Usage:
    python scripts/fetch_market_data.py

Runs automatically via cron every 10 minutes.
"""

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

# --- Configuration ---
DB_PATH = Path(__file__).parent.parent / "data" / "market.db"
DATA_SOURCES = {
    "brent_crude": {
        "name": "Brent Crude Oil",
        "unit": "USD/bbl",
        "source": "Yahoo Finance",
        "url": "https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d&range=1d",
    },
    "eur_usd": {
        "name": "EUR/USD Exchange Rate",
        "unit": "EUR/USD",
        "source": "Yahoo Finance",
        "url": "https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1d&range=1d",
    },
    "eu_ets": {
        "name": "EU ETS Carbon Price",
        "unit": "EUR/tCO2",
        "source": "Yahoo Finance (CO2.L proxy)",
        # CO2.L is a carbon/ETS related ETF that correlates with EU ETS
        "url": "https://query1.finance.yahoo.com/v8/finance/chart/CO2.L?interval=1d&range=1d",
    },
}

# Industry benchmarks (static, updated manually from monthly reports)
BENCHMARKS = {
    # Rotterdam jet fuel crack spread over Brent (historical avg ~$12-15/bbl)
    "jet_fuel_crack_spread_usd_per_bbl": 14.0,
    # SAF premium over conventional jet fuel (ReFuelEU mandates 2% by 2025)
    # HEFA-SPK typically 2-3x conventional jet fuel
    "saf_premium_multiplier": 2.5,
    # Conversion: 1 bbl jet fuel ≈ 159 liters
    "liters_per_bbl": 159.0,
    # EU ETS aviation multiplier (aviation gets 15% free allowance in 2026)
    "eu_ets_aviation_multiplier": 0.85,
}


def fetch_yahoo_finance(symbol_url: str) -> float | None:
    """Fetch the latest close price from Yahoo Finance v8 API."""
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(symbol_url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            data = resp.json()

        result = data.get("chart", {}).get("result", [{}])[0]
        meta = result.get("meta", {})
        # Use regularMarketPrice if available, otherwise previousClose
        price = meta.get("regularMarketPrice") or meta.get("previousClose")
        if price is None:
            # Fallback to last close in the data array
            closes = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
            price = [c for c in closes if c is not None][-1] if closes else None
        return round(float(price), 4) if price else None
    except Exception as exc:
        print(f"[WARN] Failed to fetch {symbol_url}: {exc}", file=sys.stderr)
        return None


def compute_derived_prices(brent_usd: float, eur_usd: float) -> dict:
    """Compute jet fuel and SAF prices from Brent crude."""
    crack = BENCHMARKS["jet_fuel_crack_spread_usd_per_bbl"]

    # Jet fuel Rotterdam = Brent + crack spread
    jet_fuel_usd_per_bbl = brent_usd + crack
    jet_fuel_usd_per_liter = jet_fuel_usd_per_bbl / BENCHMARKS["liters_per_bbl"]
    jet_fuel_eur_per_liter = jet_fuel_usd_per_liter / eur_usd if eur_usd else None

    # SAF = Jet fuel * premium multiplier
    saf_usd_per_bbl = jet_fuel_usd_per_bbl * BENCHMARKS["saf_premium_multiplier"]
    saf_usd_per_liter = saf_usd_per_bbl / BENCHMARKS["liters_per_bbl"]
    saf_eur_per_liter = saf_usd_per_liter / eur_usd if eur_usd else None

    return {
        "jet_fuel_usd_per_bbl": round(jet_fuel_usd_per_bbl, 2),
        "jet_fuel_usd_per_liter": round(jet_fuel_usd_per_liter, 4),
        "jet_fuel_eur_per_liter": round(jet_fuel_eur_per_liter, 4) if jet_fuel_eur_per_liter else None,
        "saf_usd_per_bbl": round(saf_usd_per_bbl, 2),
        "saf_usd_per_liter": round(saf_usd_per_liter, 4),
        "saf_eur_per_liter": round(saf_eur_per_liter, 4) if saf_eur_per_liter else None,
    }


def init_db(db_path: Path) -> None:
    """Ensure the market_data table exists."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            brent_usd REAL,
            eur_usd REAL,
            eu_ets_eur REAL,
            jet_fuel_usd_per_bbl REAL,
            jet_fuel_usd_per_liter REAL,
            jet_fuel_eur_per_liter REAL,
            saf_usd_per_bbl REAL,
            saf_usd_per_liter REAL,
            saf_eur_per_liter REAL,
            data_source TEXT,
            raw_json TEXT
        )
    """)
    conn.commit()
    conn.close()


def save_to_db(db_path: Path, record: dict) -> None:
    """Insert a market data record into SQLite."""
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        INSERT INTO market_data (
            timestamp, brent_usd, eur_usd, eu_ets_eur,
            jet_fuel_usd_per_bbl, jet_fuel_usd_per_liter, jet_fuel_eur_per_liter,
            saf_usd_per_bbl, saf_usd_per_liter, saf_eur_per_liter,
            data_source, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            record["timestamp"],
            record.get("brent_usd"),
            record.get("eur_usd"),
            record.get("eu_ets_eur"),
            record.get("jet_fuel_usd_per_bbl"),
            record.get("jet_fuel_usd_per_liter"),
            record.get("jet_fuel_eur_per_liter"),
            record.get("saf_usd_per_bbl"),
            record.get("saf_usd_per_liter"),
            record.get("saf_eur_per_liter"),
            record.get("data_source"),
            record.get("raw_json"),
        ),
    )
    conn.commit()
    conn.close()


def main() -> int:
    print(f"[{datetime.now(timezone.utc).isoformat()}] Fetching market data...")

    init_db(DB_PATH)

    # 1. Fetch raw data
    brent_usd = fetch_yahoo_finance(DATA_SOURCES["brent_crude"]["url"])
    eur_usd = fetch_yahoo_finance(DATA_SOURCES["eur_usd"]["url"])
    eu_ets_eur = fetch_yahoo_finance(DATA_SOURCES["eu_ets"]["url"])

    print(f"  Brent Crude: {brent_usd} USD/bbl")
    print(f"  EUR/USD: {eur_usd}")
    print(f"  EU ETS (proxy): {eu_ets_eur} EUR/tCO2")

    if brent_usd is None:
        print("[ERROR] Failed to fetch Brent crude. Aborting.", file=sys.stderr)
        return 1

    # 2. Compute derived prices
    derived = compute_derived_prices(brent_usd, eur_usd or 1.08)

    print(f"  Jet Fuel (Rotterdam est.): {derived['jet_fuel_usd_per_bbl']} USD/bbl")
    print(f"  SAF (est.): {derived['saf_usd_per_bbl']} USD/bbl")

    # 3. Build record
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "brent_usd": brent_usd,
        "eur_usd": eur_usd,
        "eu_ets_eur": eu_ets_eur,
        **derived,
        "data_source": "yahoo_finance + jetscope_estimates",
        "raw_json": json.dumps({
            "brent_usd": brent_usd,
            "eur_usd": eur_usd,
            "eu_ets_eur": eu_ets_eur,
            "benchmarks": BENCHMARKS,
        }),
    }

    # 4. Save to DB
    save_to_db(DB_PATH, record)
    print(f"  Saved to {DB_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
