"""IEA Oil Market Report adapter for jet fuel stock-days coverage.

This adapter fetches country-level jet fuel stock-days coverage for selected
European markets from the IEA stats endpoint. It is designed to fail closed on
missing credentials and degrade gracefully on network/API problems.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx
from pydantic import BaseModel, Field

from app.db.session import SessionLocal
from app.services.cache import PriceCacheService
from adapters.contract import DataSourceAdapter
from models.market_data import SourceStatus

logger = logging.getLogger(__name__)

IEA_BASE_URL = "https://api.iea.org/stats/"
IEA_CACHE_TTL_SECONDS = 24 * 60 * 60
IEA_MONTHLY_LIMIT = 1000
IEA_SUPPORTED_COUNTRIES = {"DE", "FR", "NL", "IT", "ES", "PL"}

# Response cache keys stay short so they fit the market_type column in the
# existing cache table.
_RESPONSE_CACHE_PREFIX = "iea_cov_"
_USAGE_CACHE_KEY_PREFIX = "iea_usage_"


class ConfigError(RuntimeError):
    """Raised when the IEA adapter is misconfigured."""


class StockDaysCoverage(BaseModel):
    """Normalized jet fuel stock-days coverage payload."""

    country_iso: str = Field(..., min_length=2, max_length=2)
    stock_days: float = Field(..., ge=0)
    source: str
    confidence: float = Field(..., ge=0, le=1)
    freshness_seconds: int = Field(..., ge=0)
    error_code: Optional[str] = None
    source_status: SourceStatus
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class IEAAdapter(DataSourceAdapter):
    """Adapter for IEA Oil Market Report stock-days coverage."""

    _FALLBACK_STOCK_DAYS = {
        "DE": 21.0,
        "FR": 24.0,
        "NL": 18.0,
        "IT": 20.0,
        "ES": 19.0,
        "PL": 17.0,
    }

    def __init__(
        self,
        source_id: str = "iea_oil_market_report",
        timeout_seconds: int = DataSourceAdapter.DEFAULT_TIMEOUT,
        *,
        transport: httpx.BaseTransport | None = None,
        default_country_iso: str = "DE",
    ) -> None:
        super().__init__(source_id, timeout_seconds)
        self._transport = transport
        self.default_country_iso = self._normalize_country_iso(default_country_iso)
        self._memory_cache: dict[str, tuple[StockDaysCoverage, datetime]] = {}
        self._monthly_usage: dict[str, int] = {}

    async def fetch(self) -> Dict[str, Any]:
        """Fetch the default country's coverage as a raw payload."""
        coverage = self.fetch_stock_days_coverage(self.default_country_iso)
        return coverage.model_dump(mode="python")

    def validate(self, data: Dict[str, Any]) -> bool:
        """Validate normalized coverage payload."""
        country_iso = str(data.get("country_iso", "")).upper()
        if country_iso not in IEA_SUPPORTED_COUNTRIES:
            self._record_failure("INVALID_FORMAT")
            return False

        stock_days = data.get("stock_days")
        if stock_days is None:
            self._record_failure("MISSING_FIELD")
            return False

        try:
            stock_days_value = float(stock_days)
        except (TypeError, ValueError):
            self._record_failure("INVALID_FORMAT")
            return False

        if not (0 <= stock_days_value <= 365):
            self._record_failure("INVALID_RANGE")
            return False

        return True

    def transform(self, data: Dict[str, Any]) -> BaseModel:
        """Transform raw payload into StockDaysCoverage."""
        source_status_data = data.get("source_status")
        source_status = (
            source_status_data
            if isinstance(source_status_data, SourceStatus)
            else SourceStatus.model_validate(source_status_data or self._build_source_status(
                status="healthy",
                confidence=0.92,
                error_code=None,
                consecutive_failures=0,
            ).model_dump(mode="python"))
        )

        return StockDaysCoverage(
            country_iso=self._normalize_country_iso(str(data.get("country_iso", ""))),
            stock_days=float(data["stock_days"]),
            source=str(data.get("source", self.source_id)),
            confidence=float(data.get("confidence", source_status.confidence)),
            freshness_seconds=int(data.get("freshness_seconds", 0)),
            error_code=data.get("error_code"),
            source_status=source_status,
            timestamp=data.get("timestamp") or datetime.now(timezone.utc),
        )

    def get_source_status(self) -> Tuple[str, float, Optional[str]]:
        """Get adapter health status."""
        if self._consecutive_failures == 0:
            return "healthy", 0.92, None
        if self._consecutive_failures < 3:
            return "degraded", 0.30, self._last_error_code
        return "unavailable", 0.30, self._last_error_code

    @property
    def cache_ttl_seconds(self) -> int:
        return IEA_CACHE_TTL_SECONDS

    def fetch_stock_days_coverage(self, country_iso: str) -> StockDaysCoverage:
        """Fetch jet fuel stock-days coverage for a supported country."""
        normalized_country = self._normalize_country_iso(country_iso)
        if normalized_country not in IEA_SUPPORTED_COUNTRIES:
            raise ValueError(
                f"{self.source_id}: unsupported country_iso={normalized_country}"
            )

        cached = self._get_cached_coverage(normalized_country)
        if cached is not None:
            return cached

        api_key = os.getenv("IEA_API_KEY", "").strip()
        if not api_key:
            raise ConfigError("IEA_API_KEY is required for IEAAdapter")

        month_key = datetime.now(timezone.utc).strftime("%Y-%m")
        if self._get_usage_count(month_key) >= IEA_MONTHLY_LIMIT:
            logger.warning(
                "%s: monthly rate limit reached for IEA stats API", self.source_id
            )
            self._record_failure("RATE_LIMIT")
            return self._fallback_coverage(
                normalized_country,
                error_code="RATE_LIMIT",
            )

        try:
            with httpx.Client(timeout=self.timeout_seconds, transport=self._transport) as client:
                response = client.get(
                    IEA_BASE_URL,
                    params={
                        "country": normalized_country,
                        "series": "jet_fuel_stock_days",
                        "format": "json",
                    },
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "x-api-key": api_key,
                        "Accept": "application/json",
                    },
                )
                response.raise_for_status()
                self._increment_usage(month_key)
                payload = response.json()
                stock_days = self._extract_stock_days(payload, normalized_country)
                if stock_days is None:
                    self._record_failure("PARSING_ERROR")
                    return self._fallback_coverage(
                        normalized_country,
                        error_code="PARSING_ERROR",
                    )

                raw_data = {
                    "country_iso": normalized_country,
                    "stock_days": stock_days,
                    "source": self.source_id,
                    "confidence": 0.93,
                    "freshness_seconds": 0,
                    "error_code": None,
                    "source_status": self._build_source_status(
                        status="healthy",
                        confidence=0.93,
                        error_code=None,
                        consecutive_failures=0,
                    ).model_dump(mode="python"),
                    "timestamp": datetime.now(timezone.utc),
                }
                self._consecutive_failures = 0
                self._last_error_code = None
                coverage = self.transform(raw_data)
                self._set_cached_coverage(normalized_country, coverage)
                return coverage

        except httpx.TimeoutException:
            logger.warning("%s: IEA API timeout", self.source_id)
            self._record_failure("API_TIMEOUT")
            return self._fallback_coverage(normalized_country, error_code="API_TIMEOUT")
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            if status_code == 429:
                error_code = "RATE_LIMIT"
            elif status_code in {401, 403}:
                error_code = "AUTHENTICATION_FAILED"
            else:
                error_code = "SOURCE_UNAVAILABLE"
            logger.error("%s: IEA HTTP %s", self.source_id, status_code)
            self._record_failure(error_code)
            return self._fallback_coverage(normalized_country, error_code=error_code)
        except httpx.HTTPError as exc:
            logger.error("%s: IEA connection error - %s", self.source_id, exc)
            self._record_failure("CONNECTION_ERROR")
            return self._fallback_coverage(
                normalized_country,
                error_code="CONNECTION_ERROR",
            )
        except Exception as exc:
            logger.error("%s: IEA unexpected error - %s", self.source_id, exc)
            self._record_failure("PARSING_ERROR")
            return self._fallback_coverage(
                normalized_country,
                error_code="PARSING_ERROR",
            )

    def _fallback_coverage(self, country_iso: str, *, error_code: str) -> StockDaysCoverage:
        """Return a degraded coverage estimate using cached or static fallback data."""
        cached = self._get_cached_coverage(country_iso)
        if cached is not None:
            fallback_stock_days = cached.stock_days
            freshness_seconds = cached.freshness_seconds
        else:
            fallback_stock_days = self._FALLBACK_STOCK_DAYS[country_iso]
            freshness_seconds = 0

        source_status = self._build_source_status(
            status="degraded",
            confidence=0.30,
            error_code=error_code,
            consecutive_failures=max(self._consecutive_failures, 1),
        )
        coverage = StockDaysCoverage(
            country_iso=country_iso,
            stock_days=float(fallback_stock_days),
            source=self.source_id,
            confidence=0.30,
            freshness_seconds=freshness_seconds,
            error_code=error_code,
            source_status=source_status,
        )
        self._set_cached_coverage(country_iso, coverage)
        return coverage

    def _build_source_status(
        self,
        *,
        status: str,
        confidence: float,
        error_code: Optional[str],
        consecutive_failures: int,
    ) -> SourceStatus:
        return SourceStatus(
            source_name="IEA Oil Market Report",
            source_id=self.source_id,
            status=status,
            confidence=confidence,
            last_successful_fetch=self._last_fetch_time,
            consecutive_failures=consecutive_failures,
            error_code=error_code,
            cache_ttl_seconds=self.cache_ttl_seconds,
        )

    def _extract_stock_days(self, payload: Any, country_iso: str) -> Optional[float]:
        candidates: list[dict[str, Any]] = []
        if isinstance(payload, dict):
            candidates.append(payload)
            for key in ("data", "results", "series", "items", "rows"):
                value = payload.get(key)
                if isinstance(value, list):
                    candidates.extend(item for item in value if isinstance(item, dict))
                elif isinstance(value, dict):
                    candidates.append(value)
        elif isinstance(payload, list):
            candidates.extend(item for item in payload if isinstance(item, dict))

        stock_keys = (
            "stock_days",
            "coverage_days",
            "days_of_cover",
            "inventory_days",
            "value",
            "days",
        )

        for item in candidates:
            iso = str(
                item.get("country_iso")
                or item.get("country")
                or item.get("iso")
                or item.get("countryCode")
                or ""
            ).upper()
            if iso and iso != country_iso:
                continue

            for key in stock_keys:
                value = item.get(key)
                if value is None:
                    continue
                try:
                    return float(value)
                except (TypeError, ValueError):
                    continue
        return None

    def _normalize_country_iso(self, country_iso: str) -> str:
        return country_iso.strip().upper()

    def _response_cache_key(self, country_iso: str) -> str:
        return f"{_RESPONSE_CACHE_PREFIX}{country_iso.lower()}"

    def _usage_cache_key(self, month_key: str) -> str:
        return f"{_USAGE_CACHE_KEY_PREFIX}{month_key.replace('-', '')}"

    def _get_cached_coverage(self, country_iso: str) -> Optional[StockDaysCoverage]:
        memory_hit = self._memory_cache.get(country_iso)
        if memory_hit is not None:
            coverage, expires_at = memory_hit
            if expires_at > datetime.now(timezone.utc):
                return coverage

        try:
            with SessionLocal() as db:
                cache = PriceCacheService.get_cache(db, self._response_cache_key(country_iso))
                if cache is None:
                    return None
                coverage = StockDaysCoverage.model_validate(cache.cached_data)
                self._memory_cache[country_iso] = (
                    coverage,
                    datetime.now(timezone.utc) + self._ttl_delta(),
                )
                return coverage
        except Exception as exc:  # pragma: no cover - cache should be best-effort
            logger.debug("%s: cache read skipped - %s", self.source_id, exc)
            return None

    def _set_cached_coverage(self, country_iso: str, coverage: StockDaysCoverage) -> None:
        expires_at = datetime.now(timezone.utc) + self._ttl_delta()
        self._memory_cache[country_iso] = (coverage, expires_at)

        try:
            with SessionLocal() as db:
                PriceCacheService.set_cache(
                    db,
                    self._response_cache_key(country_iso),
                    coverage.model_dump(mode="json"),
                    ttl_hours=24,
                )
        except Exception as exc:  # pragma: no cover - cache should be best-effort
            logger.debug("%s: cache write skipped - %s", self.source_id, exc)

    def _ttl_delta(self):
        from datetime import timedelta

        return timedelta(seconds=self.cache_ttl_seconds)

    def _get_usage_count(self, month_key: str) -> int:
        memory_count = self._monthly_usage.get(month_key, 0)
        try:
            with SessionLocal() as db:
                cache = PriceCacheService.get_cache(db, self._usage_cache_key(month_key))
                if cache is None:
                    return memory_count
                cached_data = cache.cached_data or {}
                if cached_data.get("month_key") != month_key:
                    return 0
                return int(cached_data.get("request_count", memory_count))
        except Exception as exc:  # pragma: no cover - cache should be best-effort
            logger.debug("%s: usage cache read skipped - %s", self.source_id, exc)
            return memory_count

    def _increment_usage(self, month_key: str) -> None:
        next_count = self._monthly_usage.get(month_key, 0) + 1
        self._monthly_usage[month_key] = next_count
        try:
            with SessionLocal() as db:
                PriceCacheService.set_cache(
                    db,
                    self._usage_cache_key(month_key),
                    {
                        "month_key": month_key,
                        "request_count": next_count,
                    },
                    ttl_hours=24,
                )
        except Exception as exc:  # pragma: no cover - cache should be best-effort
            logger.debug("%s: usage cache write skipped - %s", self.source_id, exc)
