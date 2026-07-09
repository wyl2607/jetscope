import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.api.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.models.tables import MarketSnapshot
from app.services.analysis.grid_costs import fossil_marginal_cost
from app.services.grid_history import (
    GRID_HISTORY_METRIC_KEYS,
    GRID_HISTORY_SOURCE_KEY,
    build_grid_history_response,
    seed_grid_baseline_history,
)

BASELINE_PATH = Path(__file__).resolve().parents[1] / "app/services/analysis/grid_baseline.json"


def _baseline() -> dict:
    return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))


@pytest.fixture
def db_engine(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'grid_history.sqlite3'}", future=True)
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def db_session(db_engine) -> Session:
    SessionLocal = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with SessionLocal() as db:
        yield db


@pytest.fixture
def client(db_engine, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(settings, "admin_token", "test-admin-token")
    SessionLocal = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)

    app = FastAPI(title="grid-history-store-test")
    app.include_router(api_router, prefix="/v1")

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


def test_history_falls_back_to_json_when_db_is_empty(db_session: Session) -> None:
    baseline = _baseline()

    history = build_grid_history_response(db_session)

    assert history.region == baseline["meta"]["region"]
    assert history.disclaimer == baseline["meta"]["disclaimer"]
    assert len(history.points) == len(baseline["history"])
    assert [point.year for point in history.points] == [
        entry["year"] for entry in baseline["history"]
    ]
    assert all(point.fallback is True for point in history.points)
    assert db_session.scalar(select(func.count()).select_from(MarketSnapshot)) == 0


def test_seed_grid_history_inserts_three_metrics_per_year_idempotently(
    db_session: Session,
) -> None:
    year_count = len(_baseline()["history"])

    inserted = seed_grid_baseline_history(db_session)

    assert inserted == year_count * len(GRID_HISTORY_METRIC_KEYS)
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(MarketSnapshot)
            .where(MarketSnapshot.source_key == GRID_HISTORY_SOURCE_KEY)
        )
        == inserted
    )

    second_inserted = seed_grid_baseline_history(db_session)

    assert second_inserted == 0
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(MarketSnapshot)
            .where(MarketSnapshot.source_key == GRID_HISTORY_SOURCE_KEY)
        )
        == inserted
    )


def test_seeded_history_reads_from_db_and_matches_json_baseline(db_session: Session) -> None:
    baseline_by_year = {entry["year"]: entry for entry in _baseline()["history"]}
    seed_grid_baseline_history(db_session)

    history = build_grid_history_response(db_session)

    assert len(history.points) == len(baseline_by_year)
    assert all(point.fallback is False for point in history.points)

    for point in history.points:
        baseline = baseline_by_year[point.year]
        expected_reference = fossil_marginal_cost(
            "gas_ccgt",
            fuel_cost_eur_per_mwh_th=baseline["gas_fuel_eur_per_mwh_th"],
            carbon_price_eur_per_t=baseline["carbon_price_eur_per_t"],
        )

        assert point.carbon_price_eur_per_t == pytest.approx(
            baseline["carbon_price_eur_per_t"]
        )
        assert point.fossil_marginal_cost_eur_per_mwh == pytest.approx(expected_reference)
        assert point.solar_lcoe_eur_per_mwh == pytest.approx(
            baseline["solar_lcoe_eur_per_mwh"]
        )
        assert point.source == baseline["source"]
        assert point.confidence == pytest.approx(baseline["confidence"])


def test_seed_endpoint_requires_admin_token(client: TestClient) -> None:
    response = client.post("/v1/analysis/grid-parity/history/seed")

    assert response.status_code in {401, 403}
