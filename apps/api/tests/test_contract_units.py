"""Focused unit tests for DataSourceAdapter base logic.

Tests the real concrete methods (init, _record_failure, _calculate_freshness_seconds,
is_error_recoverable, cache_ttl_seconds, execute pipeline, __repr__) via a minimal
concrete subclass. No network/IO — all async methods return synchronously.
"""

import pytest
from datetime import datetime, timezone
from typing import Any, Dict, Tuple, Optional
from pydantic import BaseModel

from adapters.contract import DataSourceAdapter


class _FakeModel(BaseModel):
    value: float


class _FakeAdapter(DataSourceAdapter):
    """Minimal concrete subclass for testing base-class logic."""

    async def fetch(self) -> Dict[str, Any]:
        return {"value": 42.0}

    def validate(self, data: Dict[str, Any]) -> bool:
        return bool(data)

    def transform(self, data: Dict[str, Any]) -> BaseModel:
        return _FakeModel(value=data["value"])

    def get_source_status(self) -> Tuple[str, float, Optional[str]]:
        return ("healthy", 1.0, None)


class TestDataSourceAdapterInit:
    """Constructor and default state."""

    def test_default_timeout(self):
        adapter = _FakeAdapter(source_id="test_src")
        assert adapter.source_id == "test_src"
        assert adapter.timeout_seconds == 10
        assert adapter._consecutive_failures == 0
        assert adapter._last_error_code is None
        assert adapter._last_fetch_time is None

    def test_custom_timeout(self):
        adapter = _FakeAdapter(source_id="slow_src", timeout_seconds=30)
        assert adapter.timeout_seconds == 30

    def test_class_constants(self):
        assert DataSourceAdapter.DEFAULT_TIMEOUT == 10
        assert DataSourceAdapter.DEFAULT_CACHE_TTL == 3600

    def test_cache_ttl_returns_default(self):
        adapter = _FakeAdapter(source_id="cached")
        assert adapter.cache_ttl_seconds == 3600


class TestDataSourceAdapterFailureTracking:
    """_record_failure and _calculate_freshness_seconds."""

    def test_record_failure_increments_and_sets_code(self):
        adapter = _FakeAdapter(source_id="failing")
        adapter._record_failure("API_TIMEOUT")
        assert adapter._consecutive_failures == 1
        assert adapter._last_error_code == "API_TIMEOUT"

    def test_record_failure_multiple_times(self):
        adapter = _FakeAdapter(source_id="failing")
        for _ in range(3):
            adapter._record_failure("API_TIMEOUT")
        assert adapter._consecutive_failures == 3

    def test_freshness_negative_when_never_fetched(self):
        adapter = _FakeAdapter(source_id="fresh")
        assert adapter._calculate_freshness_seconds() == -1

    def test_freshness_positive_after_fetch(self):
        adapter = _FakeAdapter(source_id="fresh")
        adapter._last_fetch_time = datetime.now(timezone.utc)
        freshness = adapter._calculate_freshness_seconds()
        assert freshness >= 0


class TestDataSourceAdapterErrorRecoverability:
    """is_error_recoverable against real ERROR_CODES."""

    def test_recoverable_error_codes(self):
        adapter = _FakeAdapter(source_id="err")
        assert adapter.is_error_recoverable("API_TIMEOUT") is True
        assert adapter.is_error_recoverable("RATE_LIMIT") is True
        assert adapter.is_error_recoverable("SOURCE_UNAVAILABLE") is True
        assert adapter.is_error_recoverable("CONNECTION_ERROR") is True
        assert adapter.is_error_recoverable("INVALID_RANGE") is True
        assert adapter.is_error_recoverable("PARSING_ERROR") is True
        assert adapter.is_error_recoverable("INVALID_FORMAT") is True

    def test_non_recoverable_error_codes(self):
        adapter = _FakeAdapter(source_id="err")
        assert adapter.is_error_recoverable("VALIDATION_FAILED") is False
        assert adapter.is_error_recoverable("MISSING_FIELD") is False
        assert adapter.is_error_recoverable("AUTHENTICATION_FAILED") is False

    def test_unknown_error_code_defaults_to_false(self):
        adapter = _FakeAdapter(source_id="err")
        assert adapter.is_error_recoverable("BOGUS_CODE") is False


class TestDataSourceAdapterExecute:
    """execute() pipeline: fetch → validate → transform."""

    @pytest.mark.asyncio
    async def test_execute_success_path(self):
        adapter = _FakeAdapter(source_id="ok")
        result = await adapter.execute()
        assert isinstance(result, _FakeModel)
        assert result.value == 42.0
        assert adapter._consecutive_failures == 0
        assert adapter._last_error_code is None
        assert adapter._last_fetch_time is not None

    @pytest.mark.asyncio
    async def test_execute_raises_on_empty_fetch(self):
        class _EmptyAdapter(_FakeAdapter):
            async def fetch(self) -> Dict[str, Any]:
                return {}

        adapter = _EmptyAdapter(source_id="empty")
        with pytest.raises(ValueError, match="No data returned"):
            await adapter.execute()
        assert adapter._consecutive_failures == 1
        assert adapter._last_error_code == "API_TIMEOUT"

    @pytest.mark.asyncio
    async def test_execute_raises_on_validation_failure(self):
        class _BadAdapter(_FakeAdapter):
            def validate(self, data: Dict[str, Any]) -> bool:
                return False

        adapter = _BadAdapter(source_id="bad")
        with pytest.raises(ValueError, match="Data validation failed"):
            await adapter.execute()
        assert adapter._consecutive_failures == 1
        assert adapter._last_error_code == "VALIDATION_FAILED"

    @pytest.mark.asyncio
    async def test_execute_success_resets_failure_state(self):
        class _SometimesBadAdapter(_FakeAdapter):
            def __init__(self) -> None:
                super().__init__(source_id="sometimes")
                self._call_count = 0

            def validate(self, data: Dict[str, Any]) -> bool:
                self._call_count += 1
                return self._call_count > 1  # fail first, pass second

        adapter = _SometimesBadAdapter()
        with pytest.raises(ValueError):
            await adapter.execute()
        assert adapter._consecutive_failures == 1

        result = await adapter.execute()
        assert isinstance(result, _FakeModel)
        assert adapter._consecutive_failures == 0
        assert adapter._last_error_code is None


class TestDataSourceAdapterRepr:
    """__repr__ formatting."""

    def test_repr_includes_class_source_and_failures(self):
        adapter = _FakeAdapter(source_id="my_source")
        r = repr(adapter)
        assert "FakeAdapter" in r
        assert "my_source" in r
        assert "failures=0" in r
        assert "healthy" in r

    def test_repr_reflects_failure_count(self):
        adapter = _FakeAdapter(source_id="bad")
        adapter._record_failure("API_TIMEOUT")
        r = repr(adapter)
        assert "failures=1" in r
