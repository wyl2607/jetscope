from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.services.ai_research.budget import BudgetStateRepository


@pytest.fixture
def db_path(tmp_path: Path):
    return tmp_path / "test_budget.sqlite3"


@pytest.fixture
def session_factory(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@pytest.fixture
def repo():
    return BudgetStateRepository()


@pytest.fixture
def today():
    return datetime.now(timezone.utc).date().isoformat()


class TestBudgetStateRepository:
    def test_get_or_create_creates_new_row(self, repo, session_factory, today):
        with session_factory() as db:
            row = repo.get_or_create(db, today)
            assert row.day == today
            assert row.tokens_used == 0
            assert row.exhausted is False

    def test_get_or_create_returns_existing_row(self, repo, session_factory, today):
        with session_factory() as db:
            row1 = repo.get_or_create(db, today)
            row2 = repo.get_or_create(db, today)
            assert row1.day == row2.day
            assert row1.tokens_used == row2.tokens_used

    def test_is_exhausted_false_for_new_day(self, repo, session_factory, today):
        with session_factory() as db:
            assert repo.is_exhausted(db, today) is False

    def test_record_usage_adds_tokens(self, repo, session_factory, today):
        with session_factory() as db:
            row = repo.record_usage(db, today, 150, 1000)
            assert row.tokens_used == 150
            assert row.exhausted is False

    def test_record_usage_accumulates_across_calls(self, repo, session_factory, today):
        with session_factory() as db:
            repo.record_usage(db, today, 100, 500)
            row = repo.record_usage(db, today, 200, 500)
            assert row.tokens_used == 300

    def test_record_usage_marks_exhausted_when_over_budget(self, repo, session_factory, today):
        with session_factory() as db:
            row = repo.record_usage(db, today, 600, 500)
            assert row.tokens_used == 600
            assert row.exhausted is True

    def test_record_usage_marks_exhausted_at_exact_budget(self, repo, session_factory, today):
        with session_factory() as db:
            row = repo.record_usage(db, today, 500, 500)
            assert row.tokens_used == 500
            assert row.exhausted is True

    def test_is_exhausted_true_after_exhausting(self, repo, session_factory, today):
        with session_factory() as db:
            repo.record_usage(db, today, 999, 500)
            assert repo.is_exhausted(db, today) is True

    def test_mark_exhausted_sets_exhausted_flag(self, repo, session_factory, today):
        with session_factory() as db:
            row = repo.mark_exhausted(db, today)
            assert row.exhausted is True
            assert row.tokens_used == 0

    def test_mark_exhausted_overrides_previous_usage(self, repo, session_factory, today):
        with session_factory() as db:
            repo.record_usage(db, today, 100, 1000)
            row = repo.mark_exhausted(db, today)
            assert row.exhausted is True
            assert row.tokens_used == 100

    def test_different_days_are_independent(self, repo, session_factory):
        with session_factory() as db:
            d1 = repo.get_or_create(db, "2026-01-01")
            d2 = repo.get_or_create(db, "2026-01-02")
            assert d1.day != d2.day
            assert d1.tokens_used == 0
            assert d2.tokens_used == 0

    def test_updated_at_is_set_on_create(self, repo, session_factory, today):
        with session_factory() as db:
            row = repo.get_or_create(db, today)
            assert isinstance(row.updated_at, datetime)
