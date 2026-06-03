from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from scripts.fetch_market_data import (
    BENCHMARKS,
    compute_derived_prices,
    fetch_yahoo_finance,
    init_db,
    save_to_db,
)


class TestComputeDerivedPrices:
    """Tests for the pure computation function."""

    def test_compute_derived_prices_returns_expected_values(self):
        crack = BENCHMARKS["jet_fuel_crack_spread_usd_per_bbl"]
        liters = BENCHMARKS["liters_per_bbl"]
        saf_mult = BENCHMARKS["saf_premium_multiplier"]

        result = compute_derived_prices(85.0, 1.08)

        expected_jet_bbl = 85.0 + crack
        expected_jet_l = expected_jet_bbl / liters
        expected_jet_eur = expected_jet_l / 1.08
        expected_saf_bbl = expected_jet_bbl * saf_mult
        expected_saf_l = expected_saf_bbl / liters
        expected_saf_eur = expected_saf_l / 1.08

        assert result["jet_fuel_usd_per_bbl"] == round(expected_jet_bbl, 2)
        assert result["jet_fuel_usd_per_liter"] == round(expected_jet_l, 4)
        assert result["jet_fuel_eur_per_liter"] == round(expected_jet_eur, 4)
        assert result["saf_usd_per_bbl"] == round(expected_saf_bbl, 2)
        assert result["saf_usd_per_liter"] == round(expected_saf_l, 4)
        assert result["saf_eur_per_liter"] == round(expected_saf_eur, 4)

    def test_compute_derived_prices_zero_brent(self):
        result = compute_derived_prices(0.0, 1.08)
        crack = BENCHMARKS["jet_fuel_crack_spread_usd_per_bbl"]
        assert result["jet_fuel_usd_per_bbl"] == round(crack, 2)

    def test_compute_derived_prices_rounding_precision(self):
        result = compute_derived_prices(83.456, 1.0812)
        assert result["jet_fuel_usd_per_bbl"] == round(83.456 + BENCHMARKS["jet_fuel_crack_spread_usd_per_bbl"], 2)
        assert result["jet_fuel_usd_per_liter"] == round(result["jet_fuel_usd_per_liter"], 4)
        assert result["saf_usd_per_bbl"] == round(result["saf_usd_per_bbl"], 2)

    def test_compute_derived_prices_all_keys_present(self):
        result = compute_derived_prices(75.0, 1.05)
        expected_keys = {
            "jet_fuel_usd_per_bbl", "jet_fuel_usd_per_liter", "jet_fuel_eur_per_liter",
            "saf_usd_per_bbl", "saf_usd_per_liter", "saf_eur_per_liter",
        }
        assert set(result.keys()) == expected_keys


class TestFetchYahooFinance:
    """Tests for fetch_yahoo_finance with mocked HTTP."""

    def test_successful_fetch_regular_market_price(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "chart": {
                "result": [{
                    "meta": {
                        "regularMarketPrice": 85.32,
                        "previousClose": 84.50,
                    }
                }]
            }
        }
        mock_resp.raise_for_status.return_value = None

        with patch("httpx.Client") as mock_cls:
            mock_cls.return_value.__enter__.return_value.get.return_value = mock_resp
            price = fetch_yahoo_finance("https://example.com/fake")

        assert price == 85.32

    def test_fallback_to_previous_close(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "chart": {
                "result": [{
                    "meta": {
                        "regularMarketPrice": None,
                        "previousClose": 84.50,
                    }
                }]
            }
        }
        mock_resp.raise_for_status.return_value = None

        with patch("httpx.Client") as mock_cls:
            mock_cls.return_value.__enter__.return_value.get.return_value = mock_resp
            price = fetch_yahoo_finance("https://example.com/fake")

        assert price == 84.50

    def test_fallback_to_close_array(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "chart": {
                "result": [{
                    "meta": {
                        "regularMarketPrice": None,
                        "previousClose": None,
                    },
                    "indicators": {
                        "quote": [{
                            "close": [82.0, 83.0, 84.0],
                        }]
                    }
                }]
            }
        }
        mock_resp.raise_for_status.return_value = None

        with patch("httpx.Client") as mock_cls:
            mock_cls.return_value.__enter__.return_value.get.return_value = mock_resp
            price = fetch_yahoo_finance("https://example.com/fake")

        assert price == 84.0

    def test_returns_none_on_http_error(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = Exception("HTTP 500")

        with patch("httpx.Client") as mock_cls:
            mock_cls.return_value.__enter__.return_value.get.return_value = mock_resp
            price = fetch_yahoo_finance("https://example.com/fake")

        assert price is None

    def test_returns_none_on_connection_error(self):
        with patch("httpx.Client") as mock_cls:
            mock_cls.return_value.__enter__.return_value.get.side_effect = Exception("Connection refused")
            price = fetch_yahoo_finance("https://example.com/fake")

        assert price is None

    def test_returns_none_on_malformed_json(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"chart": {"result": []}}
        mock_resp.raise_for_status.return_value = None

        with patch("httpx.Client") as mock_cls:
            mock_cls.return_value.__enter__.return_value.get.return_value = mock_resp
            price = fetch_yahoo_finance("https://example.com/fake")

        assert price is None

    def test_returns_none_on_empty_close_array(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "chart": {
                "result": [{
                    "meta": {
                        "regularMarketPrice": None,
                        "previousClose": None,
                    },
                    "indicators": {
                        "quote": [{
                            "close": [None, None],
                        }]
                    }
                }]
            }
        }
        mock_resp.raise_for_status.return_value = None

        with patch("httpx.Client") as mock_cls:
            mock_cls.return_value.__enter__.return_value.get.return_value = mock_resp
            price = fetch_yahoo_finance("https://example.com/fake")

        assert price is None


class TestDatabase:
    """Tests for init_db and save_to_db using tmp_path."""

    def test_init_db_creates_table(self, tmp_path: Path) -> None:
        db_path = tmp_path / "test_market.db"
        init_db(db_path)

        conn = sqlite3.connect(db_path)
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='market_data'")
        assert cursor.fetchone() is not None
        conn.close()

    def test_init_db_idempotent(self, tmp_path: Path) -> None:
        db_path = tmp_path / "test_market.db"
        init_db(db_path)
        init_db(db_path)
        conn = sqlite3.connect(db_path)
        cursor = conn.execute("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='market_data'")
        assert cursor.fetchone()[0] == 1
        conn.close()

    def test_save_to_db_roundtrip(self, tmp_path: Path) -> None:
        db_path = tmp_path / "test_market.db"
        init_db(db_path)

        record = {
            "timestamp": "2026-06-04T12:00:00+00:00",
            "brent_usd": 85.32,
            "eur_usd": 1.08,
            "eu_ets_eur": 75.50,
            "jet_fuel_usd_per_bbl": 99.32,
            "jet_fuel_usd_per_liter": 0.6247,
            "jet_fuel_eur_per_liter": 0.5784,
            "saf_usd_per_bbl": 248.30,
            "saf_usd_per_liter": 1.5616,
            "saf_eur_per_liter": 1.4460,
            "data_source": "yahoo_finance + jetscope_estimates",
            "raw_json": json.dumps({"brent_usd": 85.32}),
        }
        save_to_db(db_path, record)

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.execute("SELECT * FROM market_data ORDER BY id DESC LIMIT 1")
        row = dict(cursor.fetchone())
        conn.close()

        assert row["brent_usd"] == 85.32
        assert row["eur_usd"] == 1.08
        assert row["eu_ets_eur"] == 75.50
        assert row["jet_fuel_usd_per_bbl"] == 99.32
        assert row["jet_fuel_eur_per_liter"] == 0.5784
        assert row["data_source"] == "yahoo_finance + jetscope_estimates"
        assert json.loads(row["raw_json"]) == {"brent_usd": 85.32}

    def test_save_to_db_partial_nulls(self, tmp_path: Path) -> None:
        db_path = tmp_path / "test_market.db"
        init_db(db_path)

        record = {
            "timestamp": "2026-06-04T12:00:00+00:00",
            "brent_usd": None,
            "eur_usd": None,
            "eu_ets_eur": None,
            "jet_fuel_usd_per_bbl": None,
            "jet_fuel_usd_per_liter": None,
            "jet_fuel_eur_per_liter": None,
            "saf_usd_per_bbl": None,
            "saf_usd_per_liter": None,
            "saf_eur_per_liter": None,
            "data_source": "test",
            "raw_json": None,
        }
        save_to_db(db_path, record)

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.execute("SELECT * FROM market_data ORDER BY id DESC LIMIT 1")
        row = dict(cursor.fetchone())
        conn.close()

        assert row["brent_usd"] is None
        assert row["data_source"] == "test"
        assert row["raw_json"] is None
