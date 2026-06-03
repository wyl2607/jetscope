from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.api.routes.pathways import (
    DEFAULT_PATHWAYS,
    _list_pathway_rows,
    _seed_pathways_if_needed,
)
from app.models.tables import RouteCatalog


def _fresh_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'pathways.db'}", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    return SessionLocal()


class TestDefaultPathways:
    def test_constant_has_expected_count(self):
        assert len(DEFAULT_PATHWAYS) == 3

    def test_each_entry_has_required_keys(self):
        for entry in DEFAULT_PATHWAYS:
            assert "pathway_id" in entry
            assert "name" in entry
            assert "base_cost_usd_per_l" in entry
            assert "co2_savings_kg_per_l" in entry
            assert "category" in entry

    def test_pathway_ids_are_unique(self):
        ids = [e["pathway_id"] for e in DEFAULT_PATHWAYS]
        assert len(ids) == len(set(ids))

    def test_sugar_atj_has_lowest_cost(self):
        costs = [e["base_cost_usd_per_l"] for e in DEFAULT_PATHWAYS]
        assert min(costs) == 1.6


class TestSeedPathwaysIfNeeded:
    def test_seeds_when_table_empty(self, tmp_path):
        session = _fresh_session(tmp_path)
        try:
            count_before = session.query(RouteCatalog).count()
            assert count_before == 0

            _seed_pathways_if_needed(session)

            count_after = session.query(RouteCatalog).count()
            assert count_after == 3
        finally:
            session.close()

    def test_noop_when_data_exists(self, tmp_path):
        session = _fresh_session(tmp_path)
        try:
            _seed_pathways_if_needed(session)
            first_count = session.query(RouteCatalog).count()
            assert first_count == 3

            _seed_pathways_if_needed(session)

            second_count = session.query(RouteCatalog).count()
            assert second_count == 3
        finally:
            session.close()


class TestListPathwayRows:
    def test_seeds_and_returns_all_rows_sorted_by_cost_asc(self, tmp_path):
        session = _fresh_session(tmp_path)
        try:
            rows = _list_pathway_rows(session)
            assert len(rows) == 3

            for i in range(len(rows) - 1):
                assert (
                    rows[i].base_cost_usd_per_l <= rows[i + 1].base_cost_usd_per_l
                )
        finally:
            session.close()

    def test_returns_routecatalog_instances(self, tmp_path):
        session = _fresh_session(tmp_path)
        try:
            rows = _list_pathway_rows(session)
            for row in rows:
                assert isinstance(row, RouteCatalog)
                assert isinstance(row.pathway_id, str)
                assert isinstance(row.base_cost_usd_per_l, float)
        finally:
            session.close()
