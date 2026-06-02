"""Focused unit tests for error code metadata helpers."""

import pytest

from constants.error_codes import (
    ERROR_CODES,
    get_error_info,
    get_error_severity,
    is_fallback_allowed,
)


def test_get_error_info_returns_registered_mapping_values():
    info = get_error_info("API_TIMEOUT")

    assert info is ERROR_CODES["API_TIMEOUT"]
    assert info["severity"] == "HIGH"
    assert info["fallback_allowed"] is True
    assert "timed out" in info["message"].lower()


def test_get_error_info_raises_key_error_for_unknown_code():
    with pytest.raises(KeyError):
        get_error_info("DOES_NOT_EXIST")


def test_unknown_code_defaults_for_fallback_and_severity():
    assert is_fallback_allowed("DOES_NOT_EXIST") is False
    assert get_error_severity("DOES_NOT_EXIST") == "MEDIUM"


def test_known_codes_have_expected_fallback_and_severity_contracts():
    assert is_fallback_allowed("VALIDATION_FAILED") is False
    assert get_error_severity("VALIDATION_FAILED") == "CRITICAL"
    assert is_fallback_allowed("RATE_LIMIT") is True
    assert get_error_severity("RATE_LIMIT") == "MEDIUM"
