from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.router import api_router
from app.db.base import Base
from app.db.session import get_db
from app.schemas.sources import SourceCoverageMetric, SourceCoverageResponse


@pytest.fixture
def db_path(tmp_path: Path):
    return tmp_path / "test_analysis.sqlite3"


@pytest.fixture
def client(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    app = FastAPI(title="analysis-route-test")
    app.include_router(api_router, prefix="/v1")

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


def test_tipping_point_route_returns_pathways(client: TestClient):
    response = client.get("/v1/analysis/tipping-point?fossil_jet_usd_per_l=1.3&carbon_price_eur_per_t=95")
    assert response.status_code == 200
    payload = response.json()

    assert payload["signal"] in {
        "saf_cost_advantaged",
        "switch_window_opening",
        "fossil_still_advantaged",
    }
    assert payload["effective_fossil_jet_usd_per_l"] > 0
    assert len(payload["pathways"]) >= 4
    assert {"pathway_key", "display_name", "status"}.issubset(payload["pathways"][0].keys())


def test_airline_decision_route_returns_probability_matrix(client: TestClient):
    response = client.get("/v1/analysis/airline-decision?fossil_jet_usd_per_l=1.3&reserve_weeks=3&pathway_key=hefa")
    assert response.status_code == 200
    payload = response.json()

    probabilities = payload["probabilities"]
    assert payload["signal"] in {
        "switch_window_opening",
        "capacity_stress_dominant",
        "incremental_adjustment",
    }
    for key in (
        "raise_fares",
        "cut_capacity",
        "buy_spot_saf",
        "sign_long_term_offtake",
        "ground_routes",
    ):
        assert 0.0 <= probabilities[key] <= 1.0


def test_reserve_and_source_routes_return_contract_shapes(client: TestClient):
    reserve_response = client.get("/v1/reserves/eu")
    assert reserve_response.status_code == 200
    reserve_payload = reserve_response.json()
    assert reserve_payload["region"] == "eu"
    assert reserve_payload["coverage_weeks"] > 0
    assert reserve_payload["source_type"] in {"manual", "official", "public_proxy", "derived"}

    source_response = client.get("/v1/sources/coverage")
    assert source_response.status_code == 200
    source_payload = source_response.json()
    assert "metrics" in source_payload
    assert len(source_payload["metrics"]) > 0
    assert 0.0 <= source_payload["completeness"] <= 1.0
    assert source_payload["degraded"] is False
    first_metric = source_payload["metrics"][0]
    assert {"metric_key", "source_name", "source_type", "confidence_score"}.issubset(first_metric.keys())
    metric_keys = {metric["metric_key"] for metric in source_payload["metrics"]}
    assert "rotterdam_jet_fuel_usd_per_l" in metric_keys

    carbon_metric = next(metric for metric in source_payload["metrics"] if metric["metric_key"] == "carbon_proxy_usd_per_t")
    assert carbon_metric["source_type"] == "derived"

    assert "completeness" in source_payload
    assert isinstance(source_payload["completeness"], (int, float))
    assert "degraded" in source_payload
    assert isinstance(source_payload["degraded"], bool)


def test_source_coverage_route_marks_partial_coverage_as_degraded(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.api.routes import sources as sources_route
    from app.services.bootstrap import utcnow

    def _partial_coverage(_db):
        return SourceCoverageResponse(
            generated_at=utcnow(),
            completeness=5 / 7,
            degraded=True,
            metrics=[
                SourceCoverageMetric(
                    metric_key="brent_usd_per_bbl",
                    source_name="eia",
                    source_type="market_primary",
                    confidence_score=0.95,
                    lag_minutes=45,
                    fallback_used=False,
                    status="ok",
                    region="global",
                    market_scope="benchmark",
                ),
                SourceCoverageMetric(
                    metric_key="jet_usd_per_l",
                    source_name="fred",
                    source_type="market_primary",
                    confidence_score=0.91,
                    lag_minutes=150,
                    fallback_used=False,
                    status="ok",
                    region="us",
                    market_scope="statistical_series",
                ),
                SourceCoverageMetric(
                    metric_key="carbon_proxy_usd_per_t",
                    source_name="cbam+ecb",
                    source_type="derived",
                    confidence_score=0.73,
                    lag_minutes=15,
                    fallback_used=True,
                    status="ok",
                    region="eu",
                    market_scope="regulatory_proxy",
                ),
                SourceCoverageMetric(
                    metric_key="jet_eu_proxy_usd_per_l",
                    source_name="Derived from Brent",
                    source_type="derived",
                    confidence_score=0.65,
                    lag_minutes=None,
                    fallback_used=True,
                    status="seed",
                    region="eu",
                    market_scope="derived_proxy",
                ),
                SourceCoverageMetric(
                    metric_key="rotterdam_jet_fuel_usd_per_l",
                    source_name="rotterdam-jet-direct",
                    source_type="public_proxy",
                    confidence_score=0.82,
                    lag_minutes=20,
                    fallback_used=False,
                    status="ok",
                    region="eu",
                    market_scope="physical_spot_rotterdam",
                ),
                SourceCoverageMetric(
                    metric_key="eu_ets_price_eur_per_t",
                    source_name="EEX EU ETS",
                    source_type="official",
                    confidence_score=0.85,
                    lag_minutes=None,
                    fallback_used=True,
                    status="seed",
                    region="eu",
                    market_scope="compliance_market",
                ),
                SourceCoverageMetric(
                    metric_key="germany_premium_pct",
                    source_name="Derived comparison",
                    source_type="derived",
                    confidence_score=0.60,
                    lag_minutes=None,
                    fallback_used=True,
                    status="seed",
                    region="de",
                    market_scope="price_differential",
                ),
            ],
        )

    monkeypatch.setattr(sources_route, "build_source_coverage_response", _partial_coverage)

    response = client.get("/v1/sources/coverage")
    assert response.status_code == 200
    payload = response.json()

    assert payload["degraded"] is True
    assert payload["completeness"] == pytest.approx(5 / 7)
    assert len(payload["metrics"]) == 7

    seed_metrics = [metric for metric in payload["metrics"] if metric["status"] == "seed"]
    assert len(seed_metrics) == 3
    assert all(metric["fallback_used"] is True for metric in seed_metrics)
    assert {metric["metric_key"] for metric in seed_metrics} == {
        "jet_eu_proxy_usd_per_l",
        "eu_ets_price_eur_per_t",
        "germany_premium_pct",
    }
