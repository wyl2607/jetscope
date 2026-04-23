"""Application constants and configuration."""

from apps.api.constants.error_codes import ERROR_CODES, get_error_info, is_fallback_allowed, get_error_severity

__all__ = ["ERROR_CODES", "get_error_info", "is_fallback_allowed", "get_error_severity"]
