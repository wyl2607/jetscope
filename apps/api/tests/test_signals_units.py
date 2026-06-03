from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.tables import ESGSignal
from app.services.ai_research.claude_pipeline import ExtractedSignal
from app.services.ai_research.scraper import RawArticle
from app.services.ai_research.signals import SignalRepository


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", future=True)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def _article(url: str = "https://example.com/test") -> RawArticle:
    return RawArticle(
        title="Test Article",
        url=url,
        excerpt="Test excerpt",
        published_at=datetime.now(timezone.utc),
        source="test-unit",
    )


def _signal(
    signal_type: str = "OTHER",
    entities: list[str] | None = None,
    impact_direction: str = "NEUTRAL",
    confidence: float = 0.5,
    summary_en: str = "summary en",
    summary_cn: str = "summary cn",
    model: str = "claude-test",
    cache_hit: bool = False,
) -> ExtractedSignal:
    return ExtractedSignal(
        signal_type=signal_type,
        entities=entities or [],
        impact_direction=impact_direction,
        confidence=confidence,
        summary_en=summary_en,
        summary_cn=summary_cn,
        claude_model=model,
        prompt_cache_hit=cache_hit,
    )


class TestPersistSignals:
    def test_creates_signal_with_all_mapped_fields(self, db_session):
        repo = SignalRepository()
        article = _article()
        extracted = _signal(
            signal_type="POLICY_CHANGE",
            entities=["EU", "ICAO"],
            impact_direction="BULLISH_SAF",
            confidence=0.85,
            summary_en="EU policy update",
            summary_cn="欧盟政策更新",
            model="claude-sonnet-4-6",
            cache_hit=True,
        )

        signal = repo.persist_signals(db=db_session, raw_article=article, extracted=extracted)

        assert signal.source_url == article.url
        assert signal.signal_type == "POLICY_CHANGE"
        assert signal.entities == ["EU", "ICAO"]
        assert signal.impact_direction == "BULLISH_SAF"
        assert signal.confidence == 0.85
        assert signal.summary_en == "EU policy update"
        assert signal.summary_cn == "欧盟政策更新"
        assert signal.raw_title == article.title
        assert signal.raw_excerpt == article.excerpt
        assert signal.claude_model == "claude-sonnet-4-6"
        assert signal.prompt_cache_hit is True
        assert signal.created_at is not None
        assert signal.updated_at is not None
        assert signal.id is not None

    def test_update_existing_signal_preserves_id_created_at(self, db_session):
        repo = SignalRepository()
        article = _article()

        first = repo.persist_signals(
            db=db_session, raw_article=article, extracted=_signal(summary_en="first")
        )

        second = repo.persist_signals(
            db=db_session,
            raw_article=article,
            extracted=_signal(
                signal_type="PRICE_SHOCK",
                entities=["Brent"],
                impact_direction="BEARISH_SAF",
                confidence=0.92,
                summary_en="updated",
                summary_cn="更新",
                model="claude-sonnet-4-6",
                cache_hit=True,
            ),
        )

        assert second.id == first.id
        assert second.created_at == first.created_at
        assert second.updated_at >= first.updated_at
        assert second.signal_type == "PRICE_SHOCK"
        assert second.entities == ["Brent"]
        assert second.impact_direction == "BEARISH_SAF"
        assert second.confidence == 0.92
        assert second.summary_en == "updated"
        assert second.summary_cn == "更新"
        assert second.claude_model == "claude-sonnet-4-6"
        assert second.prompt_cache_hit is True
        rows = db_session.query(ESGSignal).all()
        assert len(rows) == 1


class TestListRecent:
    def test_empty_when_no_signals(self, db_session):
        repo = SignalRepository()
        results = repo.list_recent(
            db=db_session,
            since=datetime.now(timezone.utc) - timedelta(days=7),
            limit=10,
        )
        assert results == []

    def test_filters_by_signal_type(self, db_session):
        repo = SignalRepository()
        now = datetime.now(timezone.utc)
        for i, (st, url) in enumerate(
            [
                ("POLICY_CHANGE", "https://example.com/policy"),
                ("PRICE_SHOCK", "https://example.com/price"),
                ("OTHER", "https://example.com/other"),
            ]
        ):
            db_session.add(
                ESGSignal(
                    id=str(uuid4()),
                    created_at=now - timedelta(hours=i),
                    updated_at=now - timedelta(hours=i),
                    source_url=url,
                    signal_type=st,
                    entities=[],
                    impact_direction="NEUTRAL",
                    confidence=0.5 + i * 0.1,
                    summary_en="test",
                    summary_cn="test",
                    raw_title=f"Article {i}",
                    raw_excerpt="test",
                    published_at=now - timedelta(hours=i),
                    claude_model="mock",
                    prompt_cache_hit=False,
                )
            )
        db_session.commit()

        results = repo.list_recent(
            db=db_session,
            since=now - timedelta(days=1),
            limit=10,
            signal_type="POLICY_CHANGE",
        )
        assert len(results) == 1
        assert results[0].signal_type == "POLICY_CHANGE"
        assert results[0].source_url == "https://example.com/policy"

    def test_respects_limit(self, db_session):
        repo = SignalRepository()
        now = datetime.now(timezone.utc)
        for i in range(5):
            db_session.add(
                ESGSignal(
                    id=str(uuid4()),
                    created_at=now - timedelta(minutes=i),
                    updated_at=now - timedelta(minutes=i),
                    source_url=f"https://example.com/{i}",
                    signal_type="OTHER",
                    entities=[],
                    impact_direction="NEUTRAL",
                    confidence=0.5,
                    summary_en="test",
                    summary_cn="test",
                    raw_title=f"Article {i}",
                    raw_excerpt="test",
                    published_at=now - timedelta(minutes=i),
                    claude_model="mock",
                    prompt_cache_hit=False,
                )
            )
        db_session.commit()

        results = repo.list_recent(
            db=db_session,
            since=now - timedelta(days=1),
            limit=3,
        )
        assert len(results) == 3

    def test_filters_by_since(self, db_session):
        repo = SignalRepository()
        now = datetime.now(timezone.utc)
        db_session.add_all(
            [
                ESGSignal(
                    id=str(uuid4()),
                    created_at=now - timedelta(hours=3),
                    updated_at=now - timedelta(hours=3),
                    source_url="https://example.com/old",
                    signal_type="OTHER",
                    entities=[],
                    impact_direction="NEUTRAL",
                    confidence=0.5,
                    summary_en="old",
                    summary_cn="old",
                    raw_title="old",
                    raw_excerpt="old",
                    published_at=now - timedelta(hours=3),
                    claude_model="mock",
                    prompt_cache_hit=False,
                ),
                ESGSignal(
                    id=str(uuid4()),
                    created_at=now - timedelta(minutes=30),
                    updated_at=now - timedelta(minutes=30),
                    source_url="https://example.com/recent",
                    signal_type="OTHER",
                    entities=[],
                    impact_direction="NEUTRAL",
                    confidence=0.5,
                    summary_en="recent",
                    summary_cn="recent",
                    raw_title="recent",
                    raw_excerpt="recent",
                    published_at=now - timedelta(minutes=30),
                    claude_model="mock",
                    prompt_cache_hit=False,
                ),
            ]
        )
        db_session.commit()

        results = repo.list_recent(
            db=db_session,
            since=now - timedelta(hours=1),
            limit=10,
        )
        assert len(results) == 1
        assert results[0].source_url == "https://example.com/recent"

    def test_orders_by_created_at_desc(self, db_session):
        repo = SignalRepository()
        now = datetime.now(timezone.utc)
        db_session.add_all(
            [
                ESGSignal(
                    id=str(uuid4()),
                    created_at=now - timedelta(hours=4),
                    updated_at=now - timedelta(hours=4),
                    source_url="https://example.com/old",
                    signal_type="OTHER",
                    entities=[],
                    impact_direction="NEUTRAL",
                    confidence=0.5,
                    summary_en="old",
                    summary_cn="old",
                    raw_title="old",
                    raw_excerpt="old",
                    published_at=now - timedelta(hours=4),
                    claude_model="mock",
                    prompt_cache_hit=False,
                ),
                ESGSignal(
                    id=str(uuid4()),
                    created_at=now - timedelta(hours=2),
                    updated_at=now - timedelta(hours=2),
                    source_url="https://example.com/mid",
                    signal_type="OTHER",
                    entities=[],
                    impact_direction="NEUTRAL",
                    confidence=0.6,
                    summary_en="mid",
                    summary_cn="mid",
                    raw_title="mid",
                    raw_excerpt="mid",
                    published_at=now - timedelta(hours=2),
                    claude_model="mock",
                    prompt_cache_hit=False,
                ),
                ESGSignal(
                    id=str(uuid4()),
                    created_at=now - timedelta(minutes=5),
                    updated_at=now - timedelta(minutes=5),
                    source_url="https://example.com/new",
                    signal_type="OTHER",
                    entities=[],
                    impact_direction="NEUTRAL",
                    confidence=0.7,
                    summary_en="new",
                    summary_cn="new",
                    raw_title="new",
                    raw_excerpt="new",
                    published_at=now - timedelta(minutes=5),
                    claude_model="mock",
                    prompt_cache_hit=False,
                ),
            ]
        )
        db_session.commit()

        results = repo.list_recent(
            db=db_session,
            since=now - timedelta(days=1),
            limit=10,
        )
        urls = [r.source_url for r in results]
        assert urls == [
            "https://example.com/new",
            "https://example.com/mid",
            "https://example.com/old",
        ]
