from __future__ import annotations

from app.models.tables import AIResearchBudgetDay
from app.services.ai_research.budget import BudgetStateRepository


class FakeSession:
    def __init__(self, rows: dict[str, AIResearchBudgetDay] | None = None):
        self.rows = rows or {}
        self.added: list[AIResearchBudgetDay] = []
        self.commits = 0
        self.refreshed: list[AIResearchBudgetDay] = []

    def get(self, model, key: str):
        assert model is AIResearchBudgetDay
        return self.rows.get(key)

    def add(self, row: AIResearchBudgetDay) -> None:
        self.rows[row.day] = row
        self.added.append(row)

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, row: AIResearchBudgetDay) -> None:
        self.refreshed.append(row)


def test_get_or_create_creates_new_budget_day_with_initial_state():
    db = FakeSession()
    repo = BudgetStateRepository()

    row = repo.get_or_create(db, "2026-06-02")

    assert row.day == "2026-06-02"
    assert row.tokens_used == 0
    assert row.exhausted is False
    assert row.updated_at.tzinfo is not None
    assert db.rows["2026-06-02"] is row
    assert db.commits == 1
    assert db.refreshed == [row]


def test_get_or_create_reuses_existing_row_without_writing():
    existing = AIResearchBudgetDay(day="2026-06-02", tokens_used=12, exhausted=False)
    db = FakeSession({"2026-06-02": existing})
    repo = BudgetStateRepository()

    row = repo.get_or_create(db, "2026-06-02")

    assert row is existing
    assert row.tokens_used == 12
    assert row.exhausted is False
    assert db.added == []
    assert db.commits == 0
    assert db.refreshed == []


def test_record_usage_accumulates_tokens_and_marks_exhausted_at_budget():
    existing = AIResearchBudgetDay(day="2026-06-02", tokens_used=80, exhausted=False)
    db = FakeSession({"2026-06-02": existing})
    repo = BudgetStateRepository()

    row = repo.record_usage(db, "2026-06-02", tokens_used="20", token_budget="100")

    assert row is existing
    assert row.tokens_used == 100
    assert row.exhausted is True
    assert row.updated_at.tzinfo is not None
    assert db.added == [row]
    assert db.commits == 1
    assert db.refreshed == [row]


def test_mark_exhausted_sets_flag_and_is_exhausted_reads_it():
    existing = AIResearchBudgetDay(day="2026-06-02", tokens_used=7, exhausted=False)
    db = FakeSession({"2026-06-02": existing})
    repo = BudgetStateRepository()

    row = repo.mark_exhausted(db, "2026-06-02")

    assert row is existing
    assert row.tokens_used == 7
    assert row.exhausted is True
    assert repo.is_exhausted(db, "2026-06-02") is True
    assert db.commits == 1
    assert db.refreshed == [row]
