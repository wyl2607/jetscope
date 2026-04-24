from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.tables import AIResearchBudgetDay


class BudgetStateRepository:
    def get_or_create(self, db: Session, day: str) -> AIResearchBudgetDay:
        existing = db.get(AIResearchBudgetDay, day)
        if existing is not None:
            return existing

        row = AIResearchBudgetDay(
            day=day,
            tokens_used=0,
            exhausted=False,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def is_exhausted(self, db: Session, day: str) -> bool:
        row = self.get_or_create(db, day)
        return bool(row.exhausted)

    def record_usage(self, db: Session, day: str, tokens_used: int, token_budget: int) -> AIResearchBudgetDay:
        row = self.get_or_create(db, day)
        row.tokens_used += int(tokens_used)
        row.exhausted = row.tokens_used >= int(token_budget)
        row.updated_at = datetime.now(timezone.utc)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def mark_exhausted(self, db: Session, day: str) -> AIResearchBudgetDay:
        row = self.get_or_create(db, day)
        row.exhausted = True
        row.updated_at = datetime.now(timezone.utc)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row
