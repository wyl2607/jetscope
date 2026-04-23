"""Global error codes and severity levels for adapter system."""

from typing import Any, Dict, Literal

ErrorSeverity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]

ERROR_CODES: Dict[str, Dict[str, Any]] = {
    "API_TIMEOUT": {
        "severity": "HIGH",
        "fallback_allowed": True,
        "message": "Data source API request timed out",
    },
    "VALIDATION_FAILED": {
        "severity": "CRITICAL",
        "fallback_allowed": False,
        "message": "Data validation logic failed",
    },
    "MISSING_FIELD": {
        "severity": "CRITICAL",
        "fallback_allowed": False,
        "message": "Required field missing from API response",
    },
    "RATE_LIMIT": {
        "severity": "MEDIUM",
        "fallback_allowed": True,
        "message": "Rate limit exceeded on data source API",
    },
    "INVALID_RANGE": {
        "severity": "MEDIUM",
        "fallback_allowed": True,
        "message": "Data value outside acceptable range",
    },
    "SOURCE_UNAVAILABLE": {
        "severity": "HIGH",
        "fallback_allowed": True,
        "message": "Data source service is unavailable",
    },
    "PARSING_ERROR": {
        "severity": "HIGH",
        "fallback_allowed": True,
        "message": "Failed to parse API response",
    },
    "INVALID_FORMAT": {
        "severity": "MEDIUM",
        "fallback_allowed": True,
        "message": "Data format does not match expected schema",
    },
    "CONNECTION_ERROR": {
        "severity": "HIGH",
        "fallback_allowed": True,
        "message": "Network connection error when fetching data",
    },
    "AUTHENTICATION_FAILED": {
        "severity": "HIGH",
        "fallback_allowed": False,
        "message": "Authentication failed for data source",
    },
}


def get_error_info(error_code: str) -> Dict[str, Any]:
    """Get error details by code.

    Args:
        error_code: Error code identifier.

    Returns:
        Dictionary with severity, fallback_allowed, and message.

    Raises:
        KeyError: If error code is not registered.
    """
    return ERROR_CODES[error_code]


def is_fallback_allowed(error_code: str) -> bool:
    """Check if fallback is allowed for an error.

    Args:
        error_code: Error code identifier.

    Returns:
        True if fallback is allowed, False otherwise.
    """
    return ERROR_CODES.get(error_code, {}).get("fallback_allowed", False)


def get_error_severity(error_code: str) -> ErrorSeverity:
    """Get severity level of an error code.

    Args:
        error_code: Error code identifier.

    Returns:
        Severity level (LOW, MEDIUM, HIGH, CRITICAL).
    """
    return ERROR_CODES.get(error_code, {}).get("severity", "MEDIUM")
