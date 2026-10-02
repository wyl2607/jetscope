from contextlib import nullcontext

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from app import main
from app.api.router import api_router
from app.core import config
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.models.tables import MarketSnapshot, RefuelEuTarget, RouteCatalog
from app.services.bootstrap import DEFAULT_POLICY_TARGETS, seed_configuration_defaults


@pytest.mark.parametrize("mode", ["alembic", "create_all", "skipped"])
def test_configuration_gets_never_write(tmp_path, monkeypatch, mode):
    database_url = f"sqlite:///{tmp_path / 'configuration.db'}"
    engine = create_engine(database_url)
    sessions = sessionmaker(bind=engine, autoflush=False)
    # Config unit tests reload the module; migrations import its current settings.
    monkeypatch.setattr(config, "settings", settings)
    monkeypatch.setattr(settings, "database_url", database_url)
    monkeypatch.setattr(settings, "schema_bootstrap_mode", mode)
    monkeypatch.setattr(settings, "market_refresh_interval_seconds", 0)
    monkeypatch.setattr(main, "engine", engine)
    monkeypatch.setattr(main, "SessionLocal", sessions)

    if mode == "skipped":
        # A schema-only host/test harness that does not run application startup.
        Base.metadata.create_all(bind=engine)
        app = FastAPI()
        app.include_router(api_router, prefix="/v1")
    else:
        app = main.create_app()

    def read_only_db():
        with sessions() as db:
            db.connection().exec_driver_sql("PRAGMA query_only = ON")

            def reject_write(session, *args):
                pytest.fail("GET attempted to flush or commit")

            event.listen(db, "before_flush", reject_write)
            event.listen(db, "before_commit", reject_write)
            yield db

    app.dependency_overrides[get_db] = read_only_db
    client = TestClient(app)
    try:
        with (client if mode != "skipped" else nullcontext(client)):
            # Defaults must already exist before any request.
            with sessions() as db:
                assert len(db.scalars(select(RouteCatalog)).all()) == (0 if mode == "skipped" else 4)
                assert len(db.scalars(select(RefuelEuTarget)).all()) == (0 if mode == "skipped" else 3)
                assert db.scalars(select(MarketSnapshot)).all() == []

            for _ in range(2):
                pathways = client.get("/v1/pathways")
                policies = client.get("/v1/policies/refuel-eu")
                assert pathways.status_code == policies.status_code == 200
                if mode == "skipped":
                    assert pathways.json() == policies.json() == []
                else:
                    assert len(pathways.json()) == 4
                    costs = [row["base_cost_usd_per_l"] for row in pathways.json()]
                    assert costs == sorted(costs)
                    assert policies.json() == DEFAULT_POLICY_TARGETS

            with sessions() as db:
                assert len(db.scalars(select(RouteCatalog)).all()) == (0 if mode == "skipped" else 4)
                assert len(db.scalars(select(RefuelEuTarget)).all()) == (0 if mode == "skipped" else 3)
                assert db.scalars(select(MarketSnapshot)).all() == []
    finally:
        client.close()
        engine.dispose()


@pytest.mark.parametrize("populated", ["pathways", "policies", "both"])
def test_defaults_preserve_partial_configuration_and_are_idempotent(tmp_path, populated):
    engine = create_engine(f"sqlite:///{tmp_path / 'existing.db'}")
    Base.metadata.create_all(bind=engine)
    try:
        with sessionmaker(bind=engine, autoflush=False)() as db:
            if populated in {"pathways", "both"}:
                db.add(RouteCatalog(
                    pathway_id="custom", name="Custom", pathway="Custom",
                    base_cost_usd_per_l=9, co2_savings_kg_per_l=1, category="saf",
                ))
            if populated in {"policies", "both"}:
                db.add(RefuelEuTarget(
                    year=2040, saf_share_pct=42, synthetic_share_pct=9, label="Operator target",
                ))
            db.commit()
            seed_configuration_defaults(db)

            def reject_commit(session):
                pytest.fail("Repeated bootstrap attempted to commit")

            event.listen(db, "before_commit", reject_commit)
            seed_configuration_defaults(db)
            pathways = db.scalars(select(RouteCatalog)).all()
            policies = db.scalars(select(RefuelEuTarget)).all()
            if populated in {"pathways", "both"}:
                assert [(row.pathway_id, row.base_cost_usd_per_l) for row in pathways] == [("custom", 9)]
            else:
                assert len(pathways) == 4
            if populated in {"policies", "both"}:
                assert [(row.year, row.saf_share_pct, row.label) for row in policies] == [
                    (2040, 42, "Operator target")
                ]
            else:
                assert len(policies) == 3
            assert db.scalars(select(MarketSnapshot)).all() == []
    finally:
        engine.dispose()
