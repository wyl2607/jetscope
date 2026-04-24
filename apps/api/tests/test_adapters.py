"""Tests for data source adapters.

Tests adapter implementations for fetch, validate, transform, and status.
"""

import pytest
import httpx
from datetime import datetime, timezone
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

from adapters.contract import DataSourceAdapter
from adapters.rotterdam import RotterdamAdapter
from adapters.euets import EUETSAdapter
from models.market_data import (
    RotterdamEmissions,
    EUETSVolume,
)
from constants.error_codes import is_fallback_allowed


class TestDataSourceAdapterBase:
    """Test base adapter contract."""

    def test_adapter_init_defaults(self):
        """Test adapter initialization with defaults."""
        adapter = RotterdamAdapter(source_id="test_rotterdam")
        assert adapter.source_id == "test_rotterdam"
        assert adapter.timeout_seconds == 10
        assert adapter._consecutive_failures == 0
        assert adapter._last_error_code is None

    def test_record_failure(self):
        """Test failure recording increments counter."""
        adapter = RotterdamAdapter()
        adapter._record_failure("API_TIMEOUT")
        assert adapter._consecutive_failures == 1
        assert adapter._last_error_code == "API_TIMEOUT"

    def test_is_error_recoverable(self):
        """Test error recoverability check."""
        adapter = RotterdamAdapter()
        assert adapter.is_error_recoverable("API_TIMEOUT") is True
        assert adapter.is_error_recoverable("VALIDATION_FAILED") is False


class TestRotterdamAdapter:
    """Test Rotterdam air quality adapter."""

    def test_rotterdam_init(self):
        """Test Rotterdam adapter initialization."""
        adapter = RotterdamAdapter()
        assert adapter.source_id == "rotterdam_openaq"
        assert adapter.cache_ttl_seconds == 600

    def test_rotterdam_validate_success(self):
        """Test validation with valid data."""
        adapter = RotterdamAdapter()
        data = {
            "pm25_ugm3": 12.5,
            "no2_ppb": 28.3,
            "wind_speed_ms": 5.2,
        }
        assert adapter.validate(data) is True

    def test_rotterdam_validate_partial(self):
        """Test validation with partial data."""
        adapter = RotterdamAdapter()
        data = {
            "pm25_ugm3": 12.5,
            "no2_ppb": None,
            "wind_speed_ms": None,
        }
        assert adapter.validate(data) is True

    def test_rotterdam_validate_empty(self):
        """Test validation rejects empty data."""
        adapter = RotterdamAdapter()
        assert adapter.validate({}) is False
        assert adapter._last_error_code == "MISSING_FIELD"

    def test_rotterdam_validate_out_of_range(self):
        """Test validation rejects out-of-range values."""
        adapter = RotterdamAdapter()
        data = {"pm25_ugm3": 600.0, "no2_ppb": None, "wind_speed_ms": None}
        assert adapter.validate(data) is False
        assert adapter._last_error_code == "INVALID_RANGE"

    def test_rotterdam_transform(self):
        """Test transformation to RotterdamEmissions."""
        adapter = RotterdamAdapter()
        adapter._last_fetch_time = datetime.now(timezone.utc)
        data = {
            "pm25_ugm3": 12.5,
            "no2_ppb": 28.3,
            "wind_speed_ms": None,
        }
        result = adapter.transform(data)

        assert isinstance(result, RotterdamEmissions)
        assert result.pm25_ugm3 == 12.5
        assert result.no2_ppb == 28.3
        assert result.source == "rotterdam_openaq"
        assert 0.85 <= result.confidence <= 0.98

    def test_rotterdam_status_healthy(self):
        """Test status when healthy."""
        adapter = RotterdamAdapter()
        status, conf, error = adapter.get_source_status()
        assert status == "healthy"
        assert conf == 0.96
        assert error is None

    def test_rotterdam_status_degraded(self):
        """Test status when degraded."""
        adapter = RotterdamAdapter()
        adapter._consecutive_failures = 1
        adapter._last_error_code = "API_TIMEOUT"
        status, conf, error = adapter.get_source_status()
        assert status == "degraded"
        assert conf == 0.70
        assert error == "API_TIMEOUT"


class TestEUETSAdapter:
    """Test EU ETS adapter."""

    def test_euets_init(self):
        """Test EU ETS adapter initialization."""
        adapter = EUETSAdapter()
        assert adapter.source_id == "euets_registry"
        assert adapter.cache_ttl_seconds == 3600

    def test_euets_validate_success(self):
        """Test validation with valid price."""
        adapter = EUETSAdapter()
        data = {"price_eur": 85.50, "volume_tons": 150000}
        assert adapter.validate(data) is True

    def test_euets_validate_price_only(self):
        """Test validation with price only."""
        adapter = EUETSAdapter()
        data = {"price_eur": 85.50, "volume_tons": None}
        assert adapter.validate(data) is True

    def test_euets_validate_missing_price(self):
        """Test validation fails without price."""
        adapter = EUETSAdapter()
        data = {"price_eur": None, "volume_tons": 150000}
        assert adapter.validate(data) is False
        assert adapter._last_error_code == "MISSING_FIELD"

    def test_euets_validate_out_of_range(self):
        """Test validation rejects out-of-range price."""
        adapter = EUETSAdapter()
        data = {"price_eur": 600.0, "volume_tons": 150000}
        assert adapter.validate(data) is False
        assert adapter._last_error_code == "INVALID_RANGE"

    def test_euets_transform_full(self):
        """Test transformation with price and volume."""
        adapter = EUETSAdapter()
        adapter._last_fetch_time = datetime.now(timezone.utc)
        data = {"price_eur": 85.50, "volume_tons": 150000}

        result = adapter.transform(data)
        assert isinstance(result, EUETSVolume)
        assert result.price_eur == 85.50
        assert result.volume_tons == 150000
        assert result.confidence == 0.96

    def test_euets_transform_price_only(self):
        """Test transformation with price only."""
        adapter = EUETSAdapter()
        adapter._last_fetch_time = datetime.now(timezone.utc)
        data = {"price_eur": 85.50, "volume_tons": None}

        result = adapter.transform(data)
        assert result.price_eur == 85.50
        assert result.volume_tons is None
        assert result.confidence == 0.88

    def test_euets_status_healthy(self):
        """Test status when healthy."""
        adapter = EUETSAdapter()
        status, conf, error = adapter.get_source_status()
        assert status == "healthy"
        assert conf == 0.95
        assert error is None


class TestErrorCodesAndConstants:
    """Test error code definitions."""

    def test_fallback_allowed_for_recoverable_errors(self):
        """Test recoverable errors allow fallback."""
        assert is_fallback_allowed("API_TIMEOUT") is True
        assert is_fallback_allowed("RATE_LIMIT") is True
        assert is_fallback_allowed("SOURCE_UNAVAILABLE") is True

    def test_fallback_denied_for_critical_errors(self):
        """Test critical errors deny fallback."""
        assert is_fallback_allowed("VALIDATION_FAILED") is False
        assert is_fallback_allowed("MISSING_FIELD") is False
        assert is_fallback_allowed("AUTHENTICATION_FAILED") is False
