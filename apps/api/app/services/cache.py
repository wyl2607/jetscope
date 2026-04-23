"""Price cache management service."""

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models.sqlite_models import PriceCache


class PriceCacheService:
    """Service for managing 24-hour price cache."""

    CACHE_TTL_HOURS = 24

    @staticmethod
    def get_cache(db: Session, market_type: str) -> Optional[PriceCache]:
        """Get cached prices for market type if not expired."""
        cache = db.query(PriceCache).filter(
            PriceCache.market_type == market_type
        ).first()

        if cache and cache.expires_at > datetime.utcnow():
            return cache
        return None

    @staticmethod
    def set_cache(
        db: Session,
        market_type: str,
        cached_data: dict,
        ttl_hours: int = CACHE_TTL_HOURS,
    ) -> PriceCache:
        """Set or update cache for market type."""
        expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)

        cache = db.query(PriceCache).filter(
            PriceCache.market_type == market_type
        ).first()

        if cache:
            cache.cached_data = cached_data
            cache.last_updated = datetime.utcnow()
            cache.expires_at = expires_at
        else:
            cache = PriceCache(
                market_type=market_type,
                cached_data=cached_data,
                expires_at=expires_at,
            )
            db.add(cache)

        db.commit()
        db.refresh(cache)
        return cache

    @staticmethod
    def invalidate_cache(db: Session, market_type: Optional[str] = None) -> int:
        """Invalidate cache for specific market type or all markets."""
        query = db.query(PriceCache)
        if market_type:
            query = query.filter(PriceCache.market_type == market_type)

        count = query.delete()
        db.commit()
        return count

    @staticmethod
    def cleanup_expired(db: Session) -> int:
        """Remove expired cache entries."""
        now = datetime.utcnow()
        count = db.query(PriceCache).filter(PriceCache.expires_at < now).delete()
        db.commit()
        return count
