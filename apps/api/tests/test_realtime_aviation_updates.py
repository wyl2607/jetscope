"""Verify realtime aviation updates: no invented core facts, arithmetic only."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.router import api_router
from app.db.base import Base
from app.db.session import get_db
from app.services.analysis.decision_matrix import compute_airline_decision
from app.services.analysis.jet_decomposition import (
    FIXED_EU_PROXY_MULTIPLIER,
    LITERS_PER_BARREL,
    compute_jet_brent_decomposition,
)
from app.services.analysis.reserve_stress import get_eu_reserve_stress
from app.services.curated_events import get_curated_event, list_curated_events


REPO_ROOT = Path(__file__).resolve().parents[3]
CURATED_LH = REPO_ROOT / "data" / "curated" / "lufthansa_q2_2026.json"


@pytest.fixture
def client(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'rt.sqlite3'}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)
    app = FastAPI()
    app.include_router(api_router, prefix="/v1")

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


def test_jet_decomposition_is_pure_arithmetic():
    brent = 114.93
    jet = 0.867
    out = compute_jet_brent_decomposition(brent, jet, jet_source="seed")
    brent_l = brent / LITERS_PER_BARREL
    assert out["brent_usd_per_l"] == round(brent_l, 4)
    assert out["jet_vs_brent_spread_usd_per_l"] == round(jet - brent_l, 4)
    assert out["jet_vs_brent_multiplier"] == round(jet / brent_l, 4)
    assert out["fixed_eu_proxy_multiplier"] == FIXED_EU_PROXY_MULTIPLIER


def test_market_snapshot_includes_derived_decomposition(client: TestClient):
    response = client.get("/v1/market/snapshot")
    assert response.status_code == 200
    payload = response.json()
    assert "values" in payload
    assert "derived" in payload
    derived = payload["derived"]
    assert "brent_usd_per_l" in derived
    assert "jet_vs_brent_spread_usd_per_l" in derived
    assert "jet_vs_brent_multiplier" in derived
    # Derived must match arithmetic on returned values.
    brent = payload["values"]["brent_usd_per_bbl"]
    jet_key = derived["jet_source"]
    jet = payload["values"][jet_key]
    expected = compute_jet_brent_decomposition(brent, jet, jet_source=jet_key)
    assert derived["jet_vs_brent_spread_usd_per_l"] == expected["jet_vs_brent_spread_usd_per_l"]
    assert derived["jet_vs_brent_multiplier"] == expected["jet_vs_brent_multiplier"]


def test_reserve_source_name_is_honest(monkeypatch: pytest.MonkeyPatch):
    """Route-level source naming must not claim a live IATA/EUROCONTROL feed."""
    response_source = None
    # Unit-level fallback still uses curated manual values from mainline service.
    stress = get_eu_reserve_stress()
    assert stress.source_type == "manual"
    assert stress.coverage_days > 0


def test_reserve_route_contract(client: TestClient):
    response = client.get("/v1/reserves/eu")
    assert response.status_code == 200
    payload = response.json()
    assert payload["coverage_weeks"] > 0
    # Honest labeling (dashboard_contracts): not a live IATA feed claim.
    assert "not IATA/EUROCONTROL" in payload["source_name"] or "curated" in payload["source_name"].lower()
    assert "IATA / EUROCONTROL estimates (auto-dated" not in payload["source_name"]


def test_airline_decision_optional_lh_params():
    base = compute_airline_decision(1.3, 3.0, 95.0, "hefa")
    with_lh = compute_airline_decision(
        1.3,
        3.0,
        95.0,
        "hefa",
        fare_pass_through_pct=0.6,
        labor_cost_impact_eur_m=150,
        extra_fuel_cost_eur_m=750,
    )
    assert with_lh.fare_pass_through_pct == 0.6
    assert with_lh.labor_cost_impact_eur_m == 150
    assert with_lh.extra_fuel_cost_eur_m == 750
    fuel_shock = max(0.0, (1.3 - 1.0) / 0.8)
    assert with_lh.residual_fuel_cost_exposure == round(fuel_shock * 0.4, 4)
    # Baseline path without optional params leaves residual unset.
    assert base.residual_fuel_cost_exposure is None


def test_airline_decision_route_with_lh_query(client: TestClient):
    response = client.get(
        "/v1/analysis/airline-decision"
        "?fossil_jet_usd_per_l=1.3&reserve_weeks=3&pathway_key=hefa"
        "&fare_pass_through_pct=0.6&labor_cost_impact_eur_m=150&extra_fuel_cost_eur_m=750"
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["fare_pass_through_pct"] == 0.6
    assert payload["labor_cost_impact_eur_m"] == 150
    assert payload["extra_fuel_cost_eur_m"] == 750
    assert payload["residual_fuel_cost_exposure"] is not None


def test_curated_lufthansa_facts_match_article_file():
    assert CURATED_LH.is_file(), f"missing {CURATED_LH}"
    data = json.loads(CURATED_LH.read_text(encoding="utf-8"))
    facts = data["verified_facts"]
    # Only assert numbers present in the user-provided article.
    assert facts["q2_adjusted_operating_profit_eur_m"] == 383
    assert facts["q2_adjusted_operating_profit_yoy_change_pct"] == -56
    assert facts["q2_extra_kerosene_cost_iran_war_eur_m"] == 750
    assert facts["fuel_hedge_coverage_pct_gt"] == 80
    assert facts["q2_strike_cost_eur_m_approx"] == 150
    assert facts["prior_year_adjusted_operating_profit_eur_bn"] == 1.96
    assert facts["fy_guidance_adjusted_operating_profit_eur_bn"] == {"low": 1.7, "high": 2.2}
    assert facts["kerosene_cost_pass_through_pct_approx"] == 60
    assert facts["fy_fuel_cost_expected_eur_bn"] == 8.7
    assert facts["fy_fuel_cost_vs_may_forecast_eur_bn_delta"] == -0.2
    assert facts["capacity_plan_original_growth_pct_up_to"] == 4
    assert facts["europe_capacity_further_cut_under_review_pct"] == 1
    assert facts["cityline_europe_flights_cut_summer_schedule_approx"] == 20000
    # Explicit non-claims must remain listed.
    assert "exact_EU_jet_reserve_days_or_weeks" in data["explicitly_not_in_source"]
    assert "Brent_or_jet_spot_prices" in data["explicitly_not_in_source"]


def test_events_api_serves_curated_lh(client: TestClient):
    listed = client.get("/v1/events")
    assert listed.status_code == 200
    body = listed.json()
    assert body["count"] >= 1
    ids = {e["id"] for e in body["events"]}
    assert "lufthansa-q2-2026-earnings" in ids

    one = client.get("/v1/events/lufthansa-q2-2026-earnings")
    assert one.status_code == 200
    event = one.json()
    assert event["as_of"] == "2026-08-04"
    assert event["jetscope_mapping"]["fare_pass_through_pct"] == 0.6
    assert event["jetscope_mapping"]["labor_cost_impact_eur_m"] == 150
    assert event["jetscope_mapping"]["extra_fuel_cost_eur_m"] == 750
    # Must not invent jet USD/L in curated mapping.
    assert "fossil_jet_usd_per_l" not in event["jetscope_mapping"]


def test_curated_loader_finds_repo_data():
    events = list_curated_events()
    assert any(e.get("id") == "lufthansa-q2-2026-earnings" for e in events)
    assert get_curated_event("missing") is None
