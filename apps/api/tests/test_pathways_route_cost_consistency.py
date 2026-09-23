from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.router import api_router
from app.db.base import Base
from app.db.session import get_db
from app.services.analysis.pathway_costs import FOSSIL_JET_EMISSIONS_KG_PER_L, PATHWAY_COSTS


def test_pathways_route_uses_the_analysis_pathway_costs(tmp_path: Path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'pathways.sqlite3'}", future=True)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)
    app = FastAPI(title="pathway-cost-consistency-test")
    app.include_router(api_router, prefix="/v1")

    def override_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    try:
        response = TestClient(app).get("/v1/pathways")
    finally:
        engine.dispose()

    assert response.status_code == 200
    payload_by_key = {row["pathway_id"]: row for row in response.json()}
    expected = {
        key: pathway
        for key, pathway in PATHWAY_COSTS.items()
        if key != "fossil_jet_crisis"
    }
    assert set(payload_by_key) == set(expected)
    for key, pathway in expected.items():
        assert payload_by_key[key]["base_cost_usd_per_l"] == pathway.midpoint_usd_per_l
        assert payload_by_key[key]["co2_savings_kg_per_l"] == (
            FOSSIL_JET_EMISSIONS_KG_PER_L * pathway.carbon_reduction_pct / 100
        )
