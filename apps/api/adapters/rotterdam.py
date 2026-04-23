"""Rotterdam port air quality and meteorological data adapter.

Fetches PM2.5, NO2, and wind speed from OpenAQ API for Rotterdam.
"""

import logging
from typing import Any, Dict, Optional, Tuple

import httpx
from pydantic import BaseModel

from apps.api.adapters.contract import DataSourceAdapter
from apps.api.models.market_data import RotterdamEmissions

logger = logging.getLogger(__name__)

OPENAQ_BASE_URL = "https://api.openaq.org/v2"
ROTTERDAM_CACHE_TTL = 600

PM25_MAX = 500.0
NO2_MAX = 1000.0
WIND_SPEED_MAX = 50.0


class RotterdamAdapter(DataSourceAdapter):
    """Adapter for Rotterdam port air quality metrics."""

    def __init__(
        self,
        source_id: str = "rotterdam_openaq",
        timeout_seconds: int = DataSourceAdapter.DEFAULT_TIMEOUT,
    ) -> None:
        """Initialize Rotterdam adapter."""
        super().__init__(source_id, timeout_seconds)

    async def fetch(self) -> Dict[str, Any]:
        """Fetch air quality data from OpenAQ API."""
        try:
            params: Dict[str, Any] = {
                "city": "Rotterdam",
                "parameter": ["pm25", "no2"],
                "limit": 10,
            }

            async with httpx.AsyncClient(
                timeout=self.timeout_seconds
            ) as client:
                response = await client.get(
                    f"{OPENAQ_BASE_URL}/latest",
                    params=params,
                )
                response.raise_for_status()
                data = response.json()

                if not data.get("results"):
                    self._record_failure("PARSING_ERROR")
                    return {}

                return self._parse_response(data)

        except httpx.TimeoutException:
            logger.warning(f"{self.source_id}: API timeout")
            self._record_failure("API_TIMEOUT")
            return {}
        except httpx.HTTPError as e:
            logger.error(f"{self.source_id}: HTTP error - {str(e)}")
            self._record_failure("CONNECTION_ERROR")
            return {}
        except Exception as e:
            logger.error(f"{self.source_id}: Unexpected error - {str(e)}")
            self._record_failure("PARSING_ERROR")
            return {}

    def _parse_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Parse OpenAQ response."""
        parsed: Dict[str, Any] = {
            "pm25_ugm3": None,
            "no2_ppb": None,
            "wind_speed_ms": None,
        }

        for result in response.get("results", []):
            for measurement in result.get("measurements", []):
                param = measurement.get("parameter", "").lower()
                value = measurement.get("value")

                if param == "pm25" and value is not None:
                    parsed["pm25_ugm3"] = value
                elif param == "no2" and value is not None:
                    parsed["no2_ppb"] = value

        return parsed

    def validate(self, data: Dict[str, Any]) -> bool:
        """Validate Rotterdam measurements."""
        if not data:
            self._record_failure("MISSING_FIELD")
            return False

        if (
            data.get("pm25_ugm3") is None
            and data.get("no2_ppb") is None
            and data.get("wind_speed_ms") is None
        ):
            self._record_failure("MISSING_FIELD")
            return False

        pm25 = data.get("pm25_ugm3")
        if pm25 is not None and not (0 <= pm25 <= PM25_MAX):
            self._record_failure("INVALID_RANGE")
            return False

        no2 = data.get("no2_ppb")
        if no2 is not None and not (0 <= no2 <= NO2_MAX):
            self._record_failure("INVALID_RANGE")
            return False

        wind = data.get("wind_speed_ms")
        if wind is not None and not (0 <= wind <= WIND_SPEED_MAX):
            self._record_failure("INVALID_RANGE")
            return False

        return True

    def transform(self, data: Dict[str, Any]) -> BaseModel:
        """Transform validated data to RotterdamEmissions."""
        metric_count = sum(1 for v in data.values() if v is not None)
        confidence = min(0.85 + (metric_count * 0.05), 0.98)
        freshness = self._calculate_freshness_seconds()

        return RotterdamEmissions(
            pm25_ugm3=data.get("pm25_ugm3"),
            no2_ppb=data.get("no2_ppb"),
            wind_speed_ms=data.get("wind_speed_ms"),
            source=self.source_id,
            confidence=confidence,
            freshness_seconds=max(freshness, 0),
            error_code=None,
        )

    def get_source_status(self) -> Tuple[str, float, Optional[str]]:
        """Get current adapter status."""
        if self._consecutive_failures == 0:
            return "healthy", 0.96, None
        elif self._consecutive_failures < 3:
            return "degraded", 0.70, self._last_error_code
        else:
            return "unavailable", 0.30, self._last_error_code

    @property
    def cache_ttl_seconds(self) -> int:
        """Cache TTL in seconds."""
        return ROTTERDAM_CACHE_TTL
