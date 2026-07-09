from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.sqlite_models import PriceCache
import app.services.cache as cache_module
from app.services.cache import PriceCacheService


def _make_session_factory(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'cache_units.sqlite3'}", future=True)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def test_set_and_get_cache_uses_ttl_from_current_time(monkeypatch, tmp_path):
    frozen_now = datetime(2026, 1, 10, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(cache_module, "_utcnow", lambda: frozen_now)

    SessionLocal = _make_session_factory(tmp_path)
    with SessionLocal() as db:
        saved = PriceCacheService.set_cache(
            db,
            "iea_cov_de",
            {"stock_days": 21},
            ttl_hours=6,
        )
        fetched = PriceCacheService.get_cache(db, "iea_cov_de")

    assert saved.market_type == "iea_cov_de"
    assert saved.cached_data == {"stock_days": 21}
    assert cache_module._as_utc(saved.expires_at) == frozen_now + timedelta(hours=6)
    assert fetched is not None
    assert fetched.cached_data == {"stock_days": 21}


def test_set_cache_updates_existing_row_in_place(monkeypatch, tmp_path):
    first_now = datetime(2026, 2, 1, 8, 30, tzinfo=timezone.utc)
    second_now = datetime(2026, 2, 1, 9, 0, tzinfo=timezone.utc)

    SessionLocal = _make_session_factory(tmp_path)

    monkeypatch.setattr(cache_module, "_utcnow", lambda: first_now)
    with SessionLocal() as db:
        PriceCacheService.set_cache(db, "eu_ets", {"price": 95}, ttl_hours=4)

    monkeypatch.setattr(cache_module, "_utcnow", lambda: second_now)
    with SessionLocal() as db:
        updated = PriceCacheService.set_cache(db, "eu_ets", {"price": 101}, ttl_hours=2)
        row_count = db.query(PriceCache).filter(PriceCache.market_type == "eu_ets").count()

    assert row_count == 1
    assert updated.cached_data == {"price": 101}
    assert cache_module._as_utc(updated.last_updated) == second_now
    assert cache_module._as_utc(updated.expires_at) == second_now + timedelta(hours=2)


def test_invalidate_and_cleanup_expired_entries(monkeypatch, tmp_path):
    now = datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc)
    SessionLocal = _make_session_factory(tmp_path)

    with SessionLocal() as db:
        db.add(
            PriceCache(
                market_type="expired_market",
                cached_data={"v": 1},
                expires_at=(now - timedelta(minutes=5)).replace(tzinfo=None),
            )
        )
        db.add(
            PriceCache(
                market_type="active_market",
                cached_data={"v": 2},
                expires_at=(now + timedelta(hours=1)).replace(tzinfo=None),
            )
        )
        db.commit()

    monkeypatch.setattr(cache_module, "_utcnow", lambda: now)
    with SessionLocal() as db:
        cleaned = PriceCacheService.cleanup_expired(db)
        remaining = db.query(PriceCache).all()

    assert cleaned == 1
    assert len(remaining) == 1
    assert remaining[0].market_type == "active_market"

    with SessionLocal() as db:
        deleted = PriceCacheService.invalidate_cache(db, "active_market")
        final_count = db.query(PriceCache).count()

    assert deleted == 1
    assert final_count == 0
