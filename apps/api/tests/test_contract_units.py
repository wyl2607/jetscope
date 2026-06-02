from __future__ import annotations

import asyncio
import sys
import types
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

try:
    from adapters.contract import BaseModel as ContractBaseModel
    from adapters.contract import DataSourceAdapter
except SystemError as exc:
    if "pydantic-core" not in str(exc):
        raise

    class ContractBaseModel:  # type: ignore[no-redef]
        def __init__(self, **data: Any) -> None:
            for key, value in data.items():
                setattr(self, key, value)

        def __eq__(self, other: object) -> bool:
            return type(self) is type(other) and self.__dict__ == other.__dict__

    fake_pydantic = types.ModuleType("pydantic")
    fake_pydantic.BaseModel = ContractBaseModel
    sys.modules.pop("adapters.contract", None)
    sys.modules["pydantic"] = fake_pydantic

    from adapters.contract import DataSourceAdapter


class SampleMetric(ContractBaseModel):
    value: int
    source: str


class FakeAdapter(DataSourceAdapter):
    def __init__(
        self,
        *,
        fetch_result: dict[str, Any] | None = None,
        validation_result: bool = True,
        source_id: str = "fake_source",
    ) -> None:
        super().__init__(source_id=source_id, timeout_seconds=3)
        self.fetch_result = fetch_result if fetch_result is not None else {"value": 7}
        self.validation_result = validation_result
        self.fetch_calls = 0
        self.validate_calls: list[dict[str, Any]] = []
        self.transform_calls: list[dict[str, Any]] = []

    async def fetch(self) -> dict[str, Any]:
        self.fetch_calls += 1
        return self.fetch_result

    def validate(self, data: dict[str, Any]) -> bool:
        self.validate_calls.append(data)
        return self.validation_result

    def transform(self, data: dict[str, Any]) -> SampleMetric:
        self.transform_calls.append(data)
        return SampleMetric(value=data["value"], source=self.source_id)

    def get_source_status(self) -> tuple[str, float, str | None]:
        if self._last_error_code is not None:
            return ("degraded", 0.25, self._last_error_code)
        return ("healthy", 0.99, None)


def test_execute_success_resets_failure_state_and_returns_transformed_model() -> None:
    adapter = FakeAdapter(fetch_result={"value": 42})
    adapter._consecutive_failures = 2
    adapter._last_error_code = "API_TIMEOUT"

    result = asyncio.run(adapter.execute())

    assert result == SampleMetric(value=42, source="fake_source")
    assert adapter.fetch_calls == 1
    assert adapter.validate_calls == [{"value": 42}]
    assert adapter.transform_calls == [{"value": 42}]
    assert adapter._consecutive_failures == 0
    assert adapter._last_error_code is None
    assert adapter._last_fetch_time is not None


def test_execute_empty_fetch_records_timeout_and_skips_validation() -> None:
    adapter = FakeAdapter(fetch_result={})

    with pytest.raises(ValueError, match="fake_source: No data returned from API"):
        asyncio.run(adapter.execute())

    assert adapter.fetch_calls == 1
    assert adapter.validate_calls == []
    assert adapter.transform_calls == []
    assert adapter._consecutive_failures == 1
    assert adapter._last_error_code == "API_TIMEOUT"


def test_execute_validation_failure_records_validation_error_and_skips_transform() -> None:
    adapter = FakeAdapter(fetch_result={"value": 5}, validation_result=False)

    with pytest.raises(ValueError, match="fake_source: Data validation failed"):
        asyncio.run(adapter.execute())

    assert adapter.fetch_calls == 1
    assert adapter.validate_calls == [{"value": 5}]
    assert adapter.transform_calls == []
    assert adapter._consecutive_failures == 1
    assert adapter._last_error_code == "VALIDATION_FAILED"


def test_default_cache_freshness_recoverability_and_repr_helpers() -> None:
    adapter = FakeAdapter(source_id="contract_probe")

    assert adapter.cache_ttl_seconds == 3600
    assert adapter._calculate_freshness_seconds() == -1

    adapter._last_fetch_time = datetime.now(timezone.utc) - timedelta(seconds=30)
    assert 29 <= adapter._calculate_freshness_seconds() <= 31
    assert adapter.is_error_recoverable("API_TIMEOUT") is True
    assert adapter.is_error_recoverable("VALIDATION_FAILED") is False
    assert adapter.is_error_recoverable("UNKNOWN_CODE") is False
    assert repr(adapter) == "FakeAdapter(source_id=contract_probe, status=healthy, failures=0)"
