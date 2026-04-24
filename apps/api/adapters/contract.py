"""Adapter contract defining the standard interface for all data sources.

All data source adapters (Rotterdam, EU ETS, Germany Premium, etc.) must
implement this interface to ensure consistent behavior and error handling.
"""

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from pydantic import BaseModel

try:
    from constants.error_codes import ERROR_CODES
except ModuleNotFoundError:  # pragma: no cover - supports repo-root imports.
    from apps.api.constants.error_codes import ERROR_CODES

logger = logging.getLogger(__name__)


class DataSourceAdapter(ABC):
    """Abstract base class for all data source adapters.
    
    Defines the contract that all adapters must follow:
    - Async fetch with timeout
    - Validation with error codes
    - Transformation to Pydantic models
    - Status reporting with confidence scores
    
    Attributes:
        source_id: Unique identifier for this data source.
        timeout_seconds: HTTP request timeout (default 10s).
        _last_fetch_time: Timestamp of last fetch attempt.
        _consecutive_failures: Counter for error tracking.
        _last_error_code: Most recent error code, if any.
    """

    DEFAULT_TIMEOUT = 10
    DEFAULT_CACHE_TTL = 3600

    def __init__(
        self,
        source_id: str,
        timeout_seconds: int = DEFAULT_TIMEOUT,
    ) -> None:
        """Initialize adapter instance.
        
        Args:
            source_id: Unique identifier for this data source.
            timeout_seconds: HTTP request timeout in seconds.
        """
        self.source_id = source_id
        self.timeout_seconds = timeout_seconds
        self._last_fetch_time: Optional[datetime] = None
        self._consecutive_failures: int = 0
        self._last_error_code: Optional[str] = None

    @abstractmethod
    async def fetch(self) -> Dict[str, Any]:
        """Fetch raw data from the data source.
        
        Must implement async HTTP fetching with timeout enforcement.
        Errors should be logged but not raised here—return empty dict on failure.
        
        Returns:
            Dictionary with raw API response or empty dict on error.
            
        Raises:
            Should not raise; instead log and return empty dict.
        """
        pass

    @abstractmethod
    def validate(self, data: Dict[str, Any]) -> bool:
        """Validate data format and value ranges.
        
        Checks:
        - Required fields are present
        - Values are within acceptable ranges
        - Data types match expected schema
        
        Args:
            data: Raw data dictionary to validate.
            
        Returns:
            True if all validations pass, False otherwise.
        """
        pass

    @abstractmethod
    def transform(self, data: Dict[str, Any]) -> BaseModel:
        """Transform raw data to standardized Pydantic model.
        
        Args:
            data: Validated raw data dictionary.
            
        Returns:
            Pydantic model instance matching the data source's metric type.
            
        Raises:
            ValueError: If transformation fails.
        """
        pass

    @abstractmethod
    def get_source_status(self) -> Tuple[str, float, Optional[str]]:
        """Get current source status.
        
        Returns:
            Tuple of:
            - status (str): One of 'healthy', 'degraded', 'unavailable'
            - confidence (float): Confidence score [0.0, 1.0]
            - error_code (Optional[str]): Error code if failed, else None
        """
        pass

    @property
    def cache_ttl_seconds(self) -> int:
        """Time-to-live for cached data in seconds.
        
        Override this in subclasses for different cache durations.
        
        Returns:
            Cache TTL in seconds (default 3600).
        """
        return self.DEFAULT_CACHE_TTL

    async def execute(self) -> BaseModel:
        """Execute full pipeline: fetch → validate → transform.
        
        This is the main entry point for data retrieval. It handles the
        complete flow and error reporting.
        
        Returns:
            Pydantic model with fetched and transformed data.
            
        Raises:
            ValueError: If validation fails (non-recoverable).
            RuntimeError: If transformation fails.
        """
        try:
            raw_data = await self.fetch()

            if not raw_data:
                self._record_failure("API_TIMEOUT")
                raise ValueError(f"{self.source_id}: No data returned from API")

            if not self.validate(raw_data):
                self._record_failure("VALIDATION_FAILED")
                raise ValueError(f"{self.source_id}: Data validation failed")

            self._consecutive_failures = 0
            self._last_fetch_time = datetime.now(timezone.utc)
            self._last_error_code = None

            return self.transform(raw_data)

        except Exception as e:
            logger.error(
                f"{self.source_id}: Pipeline execution failed: {str(e)}",
                exc_info=True,
            )
            raise

    def _record_failure(self, error_code: str) -> None:
        """Record a fetch or validation failure.
        
        Args:
            error_code: Error code identifier from ERROR_CODES.
        """
        self._consecutive_failures += 1
        self._last_error_code = error_code
        logger.warning(
            f"{self.source_id}: Failure recorded (code={error_code}, "
            f"count={self._consecutive_failures})"
        )

    def _calculate_freshness_seconds(self) -> int:
        """Calculate how old the current data is.
        
        Returns:
            Age in seconds, or -1 if never fetched.
        """
        if self._last_fetch_time is None:
            return -1
        return int((datetime.now(timezone.utc) - self._last_fetch_time).total_seconds())

    def is_error_recoverable(self, error_code: str) -> bool:
        """Check if an error allows fallback to another source.
        
        Args:
            error_code: Error code to check.
            
        Returns:
            True if fallback is allowed, False otherwise.
        """
        return ERROR_CODES.get(error_code, {}).get("fallback_allowed", False)

    def __repr__(self) -> str:
        """String representation for logging."""
        return (
            f"{self.__class__.__name__}("
            f"source_id={self.source_id}, "
            f"status={self.get_source_status()[0]}, "
            f"failures={self._consecutive_failures})"
        )
