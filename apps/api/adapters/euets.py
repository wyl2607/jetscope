"""EU ETS trading volume and price adapter."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

import httpx
from pydantic import BaseModel

try:
    from adapters.contract import DataSourceAdapter
    from models.market_data import EUETSVolume
except ModuleNotFoundError:  # pragma: no cover - supports repo-root imports.
    from apps.api.adapters.contract import DataSourceAdapter
    from apps.api.models.market_data import EUETSVolume

logger = logging.getLogger(__name__)

EUETS_BASE_URL = "https://ec.europa.eu/clima/api"
EUETS_ENDPOINT = "/v1/ets/allowance/daily-prices"
EUETS_CACHE_TTL = 3600

PRICE_MAX_EUR = 500.0
VOLUME_MAX = 10_000_000


class EUETSAdapter(DataSourceAdapter):
    """Adapter for EU ETS trading volume and prices."""

    def __init__(
        self,
        source_id: str = "euets_registry",
        timeout_seconds: int = DataSourceAdapter.DEFAULT_TIMEOUT,
    ) -> None:
        """Initialize EU ETS adapter."""
        super().__init__(source_id, timeout_seconds)

    async def fetch(self) -> Dict[str, Any]:
        """Fetch ETS trading data."""
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds
            ) as client:
                yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime(
                    "%Y-%m-%d"
                )
                params: Dict[str, Any] = {
                    "date_from": yesterday,
                    "limit": 1,
                }

                response = await client.get(
                    f"{EUETS_BASE_URL}{EUETS_ENDPOINT}",
                    params=params,
                )
                response.raise_for_status()
                data = response.json()

                if not data.get("data") and not data.get("results"):
                    self._record_failure("MISSING_FIELD")
                    return {}

                return self._parse_response(data)

        except httpx.TimeoutException:
            logger.warning(f"{self.source_id}: API timeout")
            self._record_failure("API_TIMEOUT")
            return {}
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                self._record_failure("RATE_LIMIT")
            else:
                self._record_failure("SOURCE_UNAVAILABLE")
            logger.error(f"{self.source_id}: HTTP {e.response.status_code}")
            return {}
        except httpx.HTTPError as e:
            logger.error(f"{self.source_id}: Connection error - {str(e)}")
            self._record_failure("CONNECTION_ERROR")
            return {}
        except Exception as e:
            logger.error(f"{self.source_id}: Unexpected error - {str(e)}")
            self._record_failure("PARSING_ERROR")
            return {}

    def _parse_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Parse ETS API response."""
        parsed: Dict[str, Any] = {
            "price_eur": None,
            "volume_tons": None,
            "date": None,
        }

        data_list = response.get("data") or response.get("results") or []

        if data_list:
            latest = data_list[0]
            parsed["price_eur"] = latest.get("price")
            parsed["volume_tons"] = latest.get("volume")
            parsed["date"] = latest.get("date")

        return parsed

    def validate(self, data: Dict[str, Any]) -> bool:
        """Validate ETS trading data."""
        if not data:
            self._record_failure("MISSING_FIELD")
            return False

        price = data.get("price_eur")
        if price is None:
            self._record_failure("MISSING_FIELD")
            return False

        if not (0 <= price <= PRICE_MAX_EUR):
            self._record_failure("INVALID_RANGE")
            return False

        volume = data.get("volume_tons")
        if volume is not None and not (0 <= volume <= VOLUME_MAX):
            self._record_failure("INVALID_RANGE")
            return False

        return True

    def transform(self, data: Dict[str, Any]) -> BaseModel:
        """Transform validated ETS data."""
        has_volume = data.get("volume_tons") is not None
        confidence = 0.96 if has_volume else 0.88
        freshness = self._calculate_freshness_seconds()

        return EUETSVolume(
            price_eur=data.get("price_eur"),
            volume_tons=data.get("volume_tons"),
            source=self.source_id,
            confidence=confidence,
            freshness_seconds=max(freshness, 0),
            error_code=None,
        )

    def get_source_status(self) -> Tuple[str, float, Optional[str]]:
        """Get current adapter status."""
        if self._consecutive_failures == 0:
            return "healthy", 0.95, None
        elif self._consecutive_failures < 3:
            return "degraded", 0.72, self._last_error_code
        else:
            return "unavailable", 0.25, self._last_error_code

    @property
    def cache_ttl_seconds(self) -> int:
        """Cache TTL in seconds."""
        return EUETS_CACHE_TTL
