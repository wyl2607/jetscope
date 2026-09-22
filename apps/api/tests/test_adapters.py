"""Tests for the shared data-source adapter contract and error-code helpers.

IEA coverage lives in test_iea_adapter.py and test_iea_units.py.
"""

from typing import Any, Dict, Optional, Tuple

from pydantic import BaseModel

from adapters.contract import DataSourceAdapter
from constants.error_codes import is_fallback_allowed


class _StubAdapter(DataSourceAdapter):
    """Minimal concrete adapter so base-contract behavior can be exercised."""

    async def fetch(self) -> Dict[str, Any]:
        return {}

    def validate(self, data: Dict[str, Any]) -> bool:
        return True

    def transform(self, data: Dict[str, Any]) -> BaseModel:
        return BaseModel()

    def get_source_status(self) -> Tuple[str, float, Optional[str]]:
        return ("healthy", 1.0, None)


class TestDataSourceAdapterBase:
    """Test base adapter contract."""

    def test_adapter_init_defaults(self):
        """Test adapter initialization with defaults."""
        adapter = _StubAdapter(source_id="test_adapter")
        assert adapter.source_id == "test_adapter"
        assert adapter.timeout_seconds == 10
        assert adapter._consecutive_failures == 0
        assert adapter._last_error_code is None

    def test_record_failure(self):
        """Test failure recording increments counter."""
        adapter = _StubAdapter(source_id="test_adapter")
        adapter._record_failure("API_TIMEOUT")
        assert adapter._consecutive_failures == 1
        assert adapter._last_error_code == "API_TIMEOUT"

    def test_is_error_recoverable(self):
        """Test error recoverability check."""
        adapter = _StubAdapter(source_id="test_adapter")
        assert adapter.is_error_recoverable("API_TIMEOUT") is True
        assert adapter.is_error_recoverable("VALIDATION_FAILED") is False


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
