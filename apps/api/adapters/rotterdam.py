"""Rotterdam port air quality adapter via OpenAQ API v3.

OpenAQ v1/v2 are retired (HTTP 410). v3 requires an API key in the
``X-API-Key`` header and returns flat latest measurements keyed by sensor id,
not the old grouped ``measurements`` payload.

Without a key the adapter fails closed: empty data + AUTHENTICATION_FAILED so
status never pretends to be healthy.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Mapping, Optional, Tuple

import httpx
from pydantic import BaseModel

try:
    from adapters.contract import DataSourceAdapter
    from models.market_data import RotterdamEmissions
except ModuleNotFoundError:  # pragma: no cover - supports repo-root imports.
    from apps.api.adapters.contract import DataSourceAdapter
    from apps.api.models.market_data import RotterdamEmissions

logger = logging.getLogger(__name__)

OPENAQ_BASE_URL = "https://api.openaq.org/v3"
# Rotterdam city centre (lat,lon) — OpenAQ expects "latitude,longitude".
ROTTERDAM_COORDINATES = "51.9225,4.4792"
ROTTERDAM_RADIUS_M = 15_000
ROTTERDAM_CACHE_TTL = 600

# Preferred parameters. Wind is rarely present on government monitors; leave unset.
TARGET_PARAMETERS = ("pm25", "no2")

PM25_MAX = 500.0
NO2_MAX = 1000.0
WIND_SPEED_MAX = 50.0

# NO2 molecular weight (g/mol). Convert µg/m³ → ppb at 25°C, 1 atm:
# ppb = µg/m³ * 24.45 / MW
_NO2_UGM3_TO_PPB = 24.45 / 46.0055


class RotterdamAdapter(DataSourceAdapter):
    """Adapter for Rotterdam port air quality metrics (OpenAQ v3)."""

    def __init__(
        self,
        source_id: str = "rotterdam_openaq",
        timeout_seconds: int = DataSourceAdapter.DEFAULT_TIMEOUT,
        *,
        api_key: Optional[str] = None,
        location_id: Optional[int] = None,
    ) -> None:
        """Initialize Rotterdam adapter.

        Args:
            source_id: Adapter identity used in status / models.
            timeout_seconds: HTTP timeout.
            api_key: Optional explicit OpenAQ key (else env).
            location_id: Optional pinned OpenAQ location id (else discover).
        """
        super().__init__(source_id, timeout_seconds)
        self._api_key_override = api_key
        self._location_id_override = location_id

    def _resolve_api_key(self) -> str:
        if self._api_key_override is not None:
            return self._api_key_override.strip()
        return (
            os.getenv("JETSCOPE_OPENAQ_API_KEY", "").strip()
            or os.getenv("OPENAQ_API_KEY", "").strip()
        )

    def _resolve_location_id(self) -> Optional[int]:
        if self._location_id_override is not None:
            return self._location_id_override
        raw = (
            os.getenv("JETSCOPE_OPENAQ_LOCATION_ID", "").strip()
            or os.getenv("OPENAQ_LOCATION_ID", "").strip()
        )
        if not raw:
            return None
        try:
            return int(raw)
        except ValueError:
            logger.warning("%s: invalid OPENAQ location id %r", self.source_id, raw)
            return None

    def _auth_headers(self, api_key: str) -> Dict[str, str]:
        return {
            "X-API-Key": api_key,
            "Accept": "application/json",
        }

    async def fetch(self) -> Dict[str, Any]:
        """Fetch air quality data from OpenAQ API v3."""
        api_key = self._resolve_api_key()
        if not api_key:
            logger.warning(
                "%s: missing OpenAQ API key "
                "(set JETSCOPE_OPENAQ_API_KEY or OPENAQ_API_KEY)",
                self.source_id,
            )
            self._record_failure("AUTHENTICATION_FAILED")
            return {}

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                location = await self._resolve_location(client, api_key)
                if not location:
                    self._record_failure("SOURCE_UNAVAILABLE")
                    return {}

                location_id = int(location["id"])
                sensor_map = self._sensor_parameter_map(location)
                if not sensor_map:
                    self._record_failure("PARSING_ERROR")
                    return {}

                response = await client.get(
                    f"{OPENAQ_BASE_URL}/locations/{location_id}/latest",
                    headers=self._auth_headers(api_key),
                    params={"limit": 100},
                )
                if response.status_code in (401, 403):
                    self._record_failure("AUTHENTICATION_FAILED")
                    logger.error(
                        "%s: OpenAQ auth failed HTTP %s",
                        self.source_id,
                        response.status_code,
                    )
                    return {}
                response.raise_for_status()
                data = response.json()

                if not data.get("results"):
                    self._record_failure("PARSING_ERROR")
                    return {}

                return self._parse_response(data, sensor_map=sensor_map)

        except httpx.TimeoutException:
            logger.warning("%s: API timeout", self.source_id)
            self._record_failure("API_TIMEOUT")
            return {}
        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code if exc.response is not None else None
            if code in (401, 403):
                self._record_failure("AUTHENTICATION_FAILED")
            elif code == 429:
                self._record_failure("RATE_LIMIT")
            else:
                self._record_failure("CONNECTION_ERROR")
            logger.error("%s: HTTP error - %s", self.source_id, exc)
            return {}
        except httpx.HTTPError as exc:
            logger.error("%s: HTTP error - %s", self.source_id, exc)
            self._record_failure("CONNECTION_ERROR")
            return {}
        except Exception as exc:  # pragma: no cover - defensive
            logger.error("%s: Unexpected error - %s", self.source_id, exc)
            self._record_failure("PARSING_ERROR")
            return {}

    async def _resolve_location(
        self,
        client: httpx.AsyncClient,
        api_key: str,
    ) -> Optional[Dict[str, Any]]:
        """Return an OpenAQ location dict (with sensors) near Rotterdam."""
        pinned = self._resolve_location_id()
        if pinned is not None:
            response = await client.get(
                f"{OPENAQ_BASE_URL}/locations/{pinned}",
                headers=self._auth_headers(api_key),
            )
            if response.status_code in (401, 403):
                response.raise_for_status()
            if response.status_code == 404:
                logger.warning(
                    "%s: pinned location %s not found", self.source_id, pinned
                )
                return None
            response.raise_for_status()
            payload = response.json()
            results = payload.get("results") or []
            if results:
                return results[0]
            # Some endpoints return the object at top level
            if payload.get("id") is not None:
                return payload
            return None

        response = await client.get(
            f"{OPENAQ_BASE_URL}/locations",
            headers=self._auth_headers(api_key),
            params={
                "coordinates": ROTTERDAM_COORDINATES,
                "radius": ROTTERDAM_RADIUS_M,
                "iso": "NL",
                "limit": 25,
                "monitor": True,
            },
        )
        if response.status_code in (401, 403):
            response.raise_for_status()
        response.raise_for_status()
        results = response.json().get("results") or []
        if not results:
            # Retry without monitor filter — some useful stations may be non-monitor.
            response = await client.get(
                f"{OPENAQ_BASE_URL}/locations",
                headers=self._auth_headers(api_key),
                params={
                    "coordinates": ROTTERDAM_COORDINATES,
                    "radius": ROTTERDAM_RADIUS_M,
                    "iso": "NL",
                    "limit": 25,
                },
            )
            response.raise_for_status()
            results = response.json().get("results") or []

        return self._pick_best_location(results)

    @staticmethod
    def _sensor_parameter_map(location: Mapping[str, Any]) -> Dict[int, str]:
        """Map sensorsId -> parameter name (lowercased)."""
        mapping: Dict[int, str] = {}
        for sensor in location.get("sensors") or []:
            try:
                sensor_id = int(sensor["id"])
            except (KeyError, TypeError, ValueError):
                continue
            parameter = sensor.get("parameter") or {}
            name = str(parameter.get("name") or "").lower().strip()
            if name:
                mapping[sensor_id] = name
        return mapping

    @staticmethod
    def _pick_best_location(
        locations: list[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """Prefer stations that expose pm25 and/or no2; closer first if ranked."""
        if not locations:
            return None

        def score(loc: Mapping[str, Any]) -> Tuple[int, int, float]:
            names = {
                str((s.get("parameter") or {}).get("name") or "").lower()
                for s in (loc.get("sensors") or [])
            }
            has_pm = 1 if "pm25" in names else 0
            has_no2 = 1 if "no2" in names else 0
            target_hits = has_pm + has_no2
            # distance may be present when searching by coordinates
            distance = loc.get("distance")
            try:
                dist_val = float(distance) if distance is not None else 1e12
            except (TypeError, ValueError):
                dist_val = 1e12
            # Higher target_hits better, then closer
            return (target_hits, 1 if loc.get("isMonitor") else 0, -dist_val)

        ranked = sorted(locations, key=score, reverse=True)
        best = ranked[0]
        best_score = score(best)
        if best_score[0] == 0:
            # No target parameters at any nearby station
            return None
        return best

    def _parse_response(
        self,
        response: Dict[str, Any],
        *,
        sensor_map: Optional[Mapping[int, str]] = None,
    ) -> Dict[str, Any]:
        """Parse OpenAQ latest payload into normalized metrics.

        Supports:
        - v3 flat results (+ sensor_map sensorsId → parameter name)
        - legacy v2 grouped measurements (kept so old fixtures still parse)
        """
        parsed: Dict[str, Any] = {
            "pm25_ugm3": None,
            "no2_ppb": None,
            "wind_speed_ms": None,
            "observed_at": None,
        }

        results = response.get("results") or []
        if not results:
            return parsed

        # v3 shape: each result is one sensor reading
        if results and "measurements" not in results[0]:
            sensor_map = dict(sensor_map or {})
            # Allow tests to embed the map in the payload
            embedded = response.get("sensor_parameter_by_id") or {}
            for key, value in embedded.items():
                try:
                    sensor_map[int(key)] = str(value).lower()
                except (TypeError, ValueError):
                    continue

            for result in results:
                sensors_id = result.get("sensorsId")
                try:
                    sensors_id_int = int(sensors_id)
                except (TypeError, ValueError):
                    continue
                param = sensor_map.get(sensors_id_int, "").lower()
                value = result.get("value")
                units = str(result.get("units") or "").lower()
                # units may only live on the sensor/parameter; optional on latest
                if value is None:
                    continue
                try:
                    numeric = float(value)
                except (TypeError, ValueError):
                    continue

                if param == "pm25":
                    parsed["pm25_ugm3"] = numeric
                elif param == "no2":
                    parsed["no2_ppb"] = self._normalize_no2(numeric, units)
                elif param in {"wind_speed", "ws"}:
                    parsed["wind_speed_ms"] = numeric

                dt = result.get("datetime") or {}
                utc = dt.get("utc") if isinstance(dt, dict) else None
                if utc and not parsed["observed_at"]:
                    parsed["observed_at"] = utc

            return parsed

        # Legacy v2 shape (grouped measurements) — retained for unit fixtures
        for result in results:
            for measurement in result.get("measurements", []):
                param = str(measurement.get("parameter", "")).lower()
                value = measurement.get("value")
                units = str(measurement.get("unit") or measurement.get("units") or "").lower()
                if value is None:
                    continue
                try:
                    numeric = float(value)
                except (TypeError, ValueError):
                    continue
                if param == "pm25":
                    parsed["pm25_ugm3"] = numeric
                elif param == "no2":
                    parsed["no2_ppb"] = self._normalize_no2(numeric, units)
        return parsed

    @staticmethod
    def _normalize_no2(value: float, units: str) -> float:
        """Store NO2 as ppb; convert from µg/m³ when units indicate mass concentration."""
        units = (units or "").lower()
        if "ppb" in units:
            return value
        if "µg" in units or "ug" in units or "μg" in units or "ug/m" in units:
            return value * _NO2_UGM3_TO_PPB
        # Default OpenAQ government monitors report NO2 in µg/m³
        if not units:
            return value * _NO2_UGM3_TO_PPB
        return value

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
        metric_count = sum(
            1
            for key in ("pm25_ugm3", "no2_ppb", "wind_speed_ms")
            if data.get(key) is not None
        )
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
        if self._consecutive_failures < 3:
            return "degraded", 0.70, self._last_error_code
        return "unavailable", 0.30, self._last_error_code

    @property
    def cache_ttl_seconds(self) -> int:
        """Cache TTL in seconds."""
        return ROTTERDAM_CACHE_TTL
