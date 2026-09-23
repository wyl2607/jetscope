from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.main import app
from app.services.analysis import feedstock


def test_uco_is_placed_against_last_year_and_same_week_gasoil() -> None:
    summary = feedstock.summarize_feedstock(feedstock.load_feedstock_prices(), date(2026, 9, 23))

    uco = summary["uco"]
    # Fastmarkets week ending 2026-09-10: UCO DDP NWE EUR 1,280-1,290/t.
    assert uco["ddp_nwe_eur_per_t"] == 1285.0
    assert uco["age_days"] == 13 and uco["stale"] is False
    prior = uco["prior_year"]
    assert prior["year"] == 2025
    assert prior["vs_high_pct"] == round((1285 / 1207.5 - 1) * 100, 1)
    assert prior["vs_low_pct"] == round((1285 / 1070 - 1) * 100, 1)
    # UCO CIF ARA bulk USD 1,365-1,375/t over ICE gasoil USD 1,464/t.
    assert summary["uco_vs_gasoil"]["ratio"] == round(1370 / 1464, 2)
    assert summary["structure"]["feedstock_imported_pct"] == 85


def test_feedstock_goes_stale_after_30_days() -> None:
    data = feedstock.load_feedstock_prices()
    assert feedstock.summarize_feedstock(data, date(2026, 10, 10))["uco"]["stale"] is False
    assert feedstock.summarize_feedstock(data, date(2026, 10, 11))["uco"]["stale"] is True


def test_prior_year_range_is_only_used_for_an_earlier_year() -> None:
    data = feedstock.load_feedstock_prices()
    data = {**data, "annual_ranges": [{**data["annual_ranges"][0], "year": 2026}]}
    assert feedstock.summarize_feedstock(data, date(2026, 9, 23))["uco"]["prior_year"] is None


def test_feedstock_route() -> None:
    body = TestClient(app).get("/v1/market/feedstock").json()
    assert body["uco"]["week_ending"] == "2026-09-10"
    assert body["uco"]["prior_year"]["high_date"] == "2025-02-21"
    assert body["uco_vs_gasoil"]["ratio"] == 0.94
    assert body["structure"]["china_share_of_imports_pct"] == 61
