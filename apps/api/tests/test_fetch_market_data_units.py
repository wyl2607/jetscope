from __future__ import annotations

import json
import sqlite3

from scripts import fetch_market_data


def test_compute_derived_prices_uses_benchmarks_and_rounds_values():
    derived = fetch_market_data.compute_derived_prices(brent_usd=80.0, eur_usd=1.2)

    assert derived["jet_fuel_usd_per_bbl"] == 94.0
    assert derived["jet_fuel_usd_per_liter"] == 0.5912
    assert derived["jet_fuel_eur_per_liter"] == 0.4927
    assert derived["saf_usd_per_bbl"] == 235.0
    assert derived["saf_usd_per_liter"] == 1.478
    assert derived["saf_eur_per_liter"] == 1.2317


def test_compute_derived_prices_handles_missing_exchange_rate():
    derived = fetch_market_data.compute_derived_prices(brent_usd=80.0, eur_usd=0)

    assert derived["jet_fuel_usd_per_bbl"] == 94.0
    assert derived["jet_fuel_eur_per_liter"] is None
    assert derived["saf_eur_per_liter"] is None


def test_fetch_yahoo_finance_uses_regular_market_price(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "chart": {
                    "result": [
                        {
                            "meta": {
                                "regularMarketPrice": 87.654321,
                                "previousClose": 85.0,
                            }
                        }
                    ]
                }
            }

    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, headers):
            assert url == "https://example.test/chart"
            assert headers == {"User-Agent": "Mozilla/5.0"}
            return FakeResponse()

    monkeypatch.setattr(fetch_market_data.httpx, "Client", FakeClient)

    assert fetch_market_data.fetch_yahoo_finance("https://example.test/chart") == 87.6543


def test_fetch_yahoo_finance_falls_back_to_last_non_null_close(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "chart": {
                    "result": [
                        {
                            "meta": {},
                            "indicators": {
                                "quote": [{"close": [None, 72.1, None, 73.23456]}]
                            },
                        }
                    ]
                }
            }

    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, headers):
            return FakeResponse()

    monkeypatch.setattr(fetch_market_data.httpx, "Client", FakeClient)

    assert fetch_market_data.fetch_yahoo_finance("https://example.test/chart") == 73.2346


def test_init_db_and_save_to_db_persist_market_record(tmp_path):
    db_path = tmp_path / "market.db"
    raw_payload = {"brent_usd": 80.0, "benchmarks": {"liters_per_bbl": 159.0}}
    record = {
        "timestamp": "2026-06-02T10:00:00+00:00",
        "brent_usd": 80.0,
        "eur_usd": 1.2,
        "eu_ets_eur": 68.4,
        "jet_fuel_usd_per_bbl": 94.0,
        "jet_fuel_usd_per_liter": 0.5912,
        "jet_fuel_eur_per_liter": 0.4927,
        "saf_usd_per_bbl": 235.0,
        "saf_usd_per_liter": 1.478,
        "saf_eur_per_liter": 1.2317,
        "data_source": "unit-test-source",
        "raw_json": json.dumps(raw_payload),
    }

    fetch_market_data.init_db(db_path)
    fetch_market_data.save_to_db(db_path, record)

    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT timestamp, brent_usd, eur_usd, eu_ets_eur,
                   jet_fuel_usd_per_bbl, saf_eur_per_liter, data_source, raw_json
            FROM market_data
            """
        ).fetchone()

    assert row[0] == "2026-06-02T10:00:00+00:00"
    assert row[1:6] == (80.0, 1.2, 68.4, 94.0, 1.2317)
    assert row[6] == "unit-test-source"
    assert json.loads(row[7]) == raw_payload
