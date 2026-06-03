from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from constants.error_codes import (
    ERROR_CODES,
    get_error_info,
    is_fallback_allowed,
    get_error_severity,
)


def test_get_error_info_returns_correct_data_for_known_code():
    info = get_error_info("API_TIMEOUT")
    assert info == {
        "severity": "HIGH",
        "fallback_allowed": True,
        "message": "Data source API request timed out",
    }


def test_get_error_info_raises_key_error_for_unknown_code():
    try:
        get_error_info("BOGUS_CODE")
        assert False, "Expected KeyError"
    except KeyError:
        pass


def test_is_fallback_allowed_returns_true_when_allowed():
    assert is_fallback_allowed("API_TIMEOUT") is True
    assert is_fallback_allowed("RATE_LIMIT") is True


def test_is_fallback_allowed_returns_false_when_disallowed():
    assert is_fallback_allowed("VALIDATION_FAILED") is False
    assert is_fallback_allowed("MISSING_FIELD") is False


def test_is_fallback_allowed_returns_false_for_unknown_code():
    assert is_fallback_allowed("BOGUS_CODE") is False


def test_get_error_severity_returns_correct_severity():
    assert get_error_severity("API_TIMEOUT") == "HIGH"
    assert get_error_severity("VALIDATION_FAILED") == "CRITICAL"
    assert get_error_severity("RATE_LIMIT") == "MEDIUM"


def test_get_error_severity_returns_medium_for_unknown_code():
    assert get_error_severity("BOGUS_CODE") == "MEDIUM"


def test_all_known_codes_have_required_fields():
    for code, details in ERROR_CODES.items():
        assert "severity" in details, f"{code} missing severity"
        assert "fallback_allowed" in details, f"{code} missing fallback_allowed"
        assert "message" in details, f"{code} missing message"
        assert details["severity"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
        assert isinstance(details["fallback_allowed"], bool)
        assert isinstance(details["message"], str) and len(details["message"]) > 0
