from __future__ import annotations

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.api.routes.policies import (
    DEFAULT_POLICY_TARGETS,
    _list_policy_rows,
    _seed_policies_if_needed,
)
from app.models.tables import RefuelEuTarget


@pytest.fixture
def session():
    engine = create_engine("sqlite://", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_default_policy_targets_has_three_entries():
    assert len(DEFAULT_POLICY_TARGETS) == 3


def test_default_policy_targets_sorted_by_year():
    years = [t["year"] for t in DEFAULT_POLICY_TARGETS]
    assert years == sorted(years)


def test_seed_policies_populates_empty_table(session):
    assert session.scalar(select(RefuelEuTarget.year).limit(1)) is None
    _seed_policies_if_needed(session)
    rows = session.scalars(
        select(RefuelEuTarget).order_by(RefuelEuTarget.year.asc())
    ).all()
    assert len(rows) == 3
    assert rows[0].year == 2030
    assert rows[0].saf_share_pct == 6


def test_seed_policies_does_not_seed_twice(session):
    _seed_policies_if_needed(session)
    count_before = len(session.scalars(select(RefuelEuTarget)).all())
    _seed_policies_if_needed(session)
    count_after = len(session.scalars(select(RefuelEuTarget)).all())
    assert count_before == count_after == 3


def test_list_policy_rows_returns_seeded_data(session):
    rows = _list_policy_rows(session)
    assert len(rows) == 3
    assert [r.year for r in rows] == [2030, 2035, 2050]


def test_list_policy_rows_with_prepopulated_data(session):
    session.add(RefuelEuTarget(year=2025, saf_share_pct=1.0, synthetic_share_pct=0.5, label="Pre"))
    session.commit()
    rows = _list_policy_rows(session)
    years = [r.year for r in rows]
    # seed is skipped because 2025 already exists, so only our row appears
    assert years == [2025]
