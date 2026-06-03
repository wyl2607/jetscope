from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.sqlite_models import PriceCache
from app.services import cache as cache_module


def test_utcnow_returns_aware_datetime():
    now = cache_module._utcnow()
    assert now.tzinfo is not None
    assert now.tzinfo.utcoffset(now) == timedelta(0)


def test_as_utc_naive_treated_as_utc():
    naive = datetime(2026, 6, 4, 12, 30, 0)
    result = cache_module._as_utc(naive)
    assert result.tzinfo is not None
    assert result.utcoffset() == timedelta(0)
    assert result.hour == 12


def test_as_utc_aware_converted_to_utc():
    eastern = timezone(timedelta(hours=-5))
    aware = datetime(2026, 6, 4, 12, 0, 0, tzinfo=eastern)
    result = cache_module._as_utc(aware)
    assert result.utcoffset() == timedelta(0)
    assert result.hour == 17


def test_set_cache_creates_new_record(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test_set_new.sqlite3'}", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    with SessionLocal() as db:
        cache_module.PriceCacheService.set_cache(db, "test_market", {"key": "value"}, ttl_hours=48)

    with SessionLocal() as db:
        records = db.query(PriceCache).all()
        assert len(records) == 1
        assert records[0].market_type == "test_market"
        assert records[0].cached_data == {"key": "value"}


def test_set_cache_updates_existing_record(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test_set_update.sqlite3'}", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    with SessionLocal() as db:
        cache_module.PriceCacheService.set_cache(db, "m1", {"v": 1})
    with SessionLocal() as db:
        cache_module.PriceCacheService.set_cache(db, "m1", {"v": 2})
    with SessionLocal() as db:
        records = db.query(PriceCache).all()
        assert len(records) == 1
        assert records[0].cached_data == {"v": 2}


def test_invalidate_cache_removes_specific_market(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test_invalidate.sqlite3'}", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    with SessionLocal() as db:
        cache_module.PriceCacheService.set_cache(db, "keep", {"x": 1})
        cache_module.PriceCacheService.set_cache(db, "remove", {"y": 2})

    with SessionLocal() as db:
        removed = cache_module.PriceCacheService.invalidate_cache(db, market_type="remove")
        assert removed == 1

    with SessionLocal() as db:
        remaining = db.query(PriceCache).all()
        assert len(remaining) == 1
        assert remaining[0].market_type == "keep"


def test_invalidate_cache_removes_all_when_no_market(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test_invalidate_all.sqlite3'}", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    with SessionLocal() as db:
        cache_module.PriceCacheService.set_cache(db, "a", {})
        cache_module.PriceCacheService.set_cache(db, "b", {})

    with SessionLocal() as db:
        count = cache_module.PriceCacheService.invalidate_cache(db)
        assert count == 2

    with SessionLocal() as db:
        assert db.query(PriceCache).count() == 0


def test_cleanup_expired_removes_only_expired(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test_cleanup.sqlite3'}", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    with SessionLocal() as db:
        db.add(PriceCache(
            market_type="expired",
            cached_data={},
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        ))
        db.add(PriceCache(
            market_type="fresh",
            cached_data={},
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        db.commit()

    with SessionLocal() as db:
        cleaned = cache_module.PriceCacheService.cleanup_expired(db)
        assert cleaned == 1

    with SessionLocal() as db:
        remaining = db.query(PriceCache).all()
        assert len(remaining) == 1
        assert remaining[0].market_type == "fresh"
