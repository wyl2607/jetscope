from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.ai_research.claude_pipeline import BudgetExceeded, ClaudeSignalExtractor
from app.services.ai_research.scraper import NewsScraper
from app.services.ai_research.signals import SignalRepository


def run_daily_pipeline(db: Session) -> dict[str, int]:
    scraper = NewsScraper()
    extractor = ClaudeSignalExtractor()
    repository = SignalRepository()

    fetched = 0
    extracted = 0
    persisted = 0
    skipped_budget = 0

    articles = scraper.fetch_recent()
    fetched = len(articles)
    for index, article in enumerate(articles):
        try:
            signals = extractor.extract(article, db=db)
        except BudgetExceeded:
            skipped_budget += len(articles) - index
            break

        extracted += len(signals)
        for signal in signals:
            repository.persist_signals(db, article, signal)
            persisted += 1

    return {
        "fetched": fetched,
        "extracted": extracted,
        "persisted": persisted,
        "skipped_budget": skipped_budget,
    }


__all__ = ["run_daily_pipeline", "BudgetExceeded", "ClaudeSignalExtractor", "NewsScraper", "SignalRepository"]
