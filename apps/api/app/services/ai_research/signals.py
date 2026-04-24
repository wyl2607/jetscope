from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tables import ESGSignal
from app.services.ai_research.claude_pipeline import ExtractedSignal
from app.services.ai_research.scraper import RawArticle


class SignalRepository:
    def persist_signals(self, db: Session, raw_article: RawArticle, extracted: ExtractedSignal) -> ESGSignal:
        existing = db.scalar(select(ESGSignal).where(ESGSignal.source_url == raw_article.url))
        now = datetime.now(timezone.utc)
        if existing is None:
            signal = ESGSignal(
                id=str(uuid4()),
                created_at=now,
                updated_at=now,
                source_url=raw_article.url,
                signal_type=extracted.signal_type,
                entities=extracted.entities,
                impact_direction=extracted.impact_direction,
                confidence=extracted.confidence,
                summary_en=extracted.summary_en,
                summary_cn=extracted.summary_cn,
                raw_title=raw_article.title,
                raw_excerpt=raw_article.excerpt,
                published_at=raw_article.published_at,
                claude_model=extracted.claude_model,
                prompt_cache_hit=extracted.prompt_cache_hit,
            )
            db.add(signal)
            db.commit()
            db.refresh(signal)
            return signal

        existing.updated_at = now
        existing.signal_type = extracted.signal_type
        existing.entities = extracted.entities
        existing.impact_direction = extracted.impact_direction
        existing.confidence = extracted.confidence
        existing.summary_en = extracted.summary_en
        existing.summary_cn = extracted.summary_cn
        existing.raw_title = raw_article.title
        existing.raw_excerpt = raw_article.excerpt
        existing.published_at = raw_article.published_at
        existing.claude_model = extracted.claude_model
        existing.prompt_cache_hit = extracted.prompt_cache_hit
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    def list_recent(
        self,
        db: Session,
        since: datetime,
        limit: int,
        signal_type: str | None = None,
    ) -> list[ESGSignal]:
        query = select(ESGSignal).where(ESGSignal.created_at >= since)
        if signal_type:
            query = query.where(ESGSignal.signal_type == signal_type)
        query = query.order_by(ESGSignal.created_at.desc()).limit(limit)
        return list(db.scalars(query).all())
