"""Unit tests for app.security — require_admin_token."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.security import require_admin_token


class TestRequireAdminToken:

    def test_missing_token_returns_401(self):
        with patch("app.security.settings") as mock_settings:
            mock_settings.admin_token = "s3cret"
            with pytest.raises(HTTPException) as exc:
                require_admin_token(x_admin_token=None)
            assert exc.value.status_code == 401
            assert "Invalid admin token" in exc.value.detail

    def test_wrong_token_returns_401(self):
        with patch("app.security.settings") as mock_settings:
            mock_settings.admin_token = "s3cret"
            with pytest.raises(HTTPException) as exc:
                require_admin_token(x_admin_token="wrong")
            assert exc.value.status_code == 401

    def test_correct_token_succeeds(self):
        with patch("app.security.settings") as mock_settings:
            mock_settings.admin_token = "s3cret"
            result = require_admin_token(x_admin_token="s3cret")
            assert result is None

    def test_unconfigured_token_returns_500(self):
        with patch("app.security.settings") as mock_settings:
            mock_settings.admin_token = ""
            with pytest.raises(HTTPException) as exc:
                require_admin_token(x_admin_token="anything")
            assert exc.value.status_code == 500
            assert "not configured" in exc.value.detail
