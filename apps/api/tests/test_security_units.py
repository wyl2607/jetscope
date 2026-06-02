import pytest
from fastapi import HTTPException

from app import security


def test_require_admin_token_returns_500_when_server_token_missing(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(security.settings, "admin_token", "")

    with pytest.raises(HTTPException) as exc_info:
        security.require_admin_token(x_admin_token="any-token")

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Server admin token is not configured"


def test_require_admin_token_returns_401_without_header_and_skips_compare_digest(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(security.settings, "admin_token", "expected-token")

    def _should_not_run(*_args, **_kwargs):
        raise AssertionError("compare_digest should not run when x_admin_token is None")

    monkeypatch.setattr(security.hmac, "compare_digest", _should_not_run)

    with pytest.raises(HTTPException) as exc_info:
        security.require_admin_token(x_admin_token=None)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid admin token"


def test_require_admin_token_returns_401_for_invalid_header(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(security.settings, "admin_token", "expected-token")
    calls: list[tuple[str, str]] = []

    def _fake_compare_digest(provided: str, expected: str) -> bool:
        calls.append((provided, expected))
        return False

    monkeypatch.setattr(security.hmac, "compare_digest", _fake_compare_digest)

    with pytest.raises(HTTPException) as exc_info:
        security.require_admin_token(x_admin_token="wrong-token")

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid admin token"
    assert calls == [("wrong-token", "expected-token")]


def test_require_admin_token_allows_valid_header(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(security.settings, "admin_token", "expected-token")
    calls: list[tuple[str, str]] = []

    def _fake_compare_digest(provided: str, expected: str) -> bool:
        calls.append((provided, expected))
        return True

    monkeypatch.setattr(security.hmac, "compare_digest", _fake_compare_digest)

    security.require_admin_token(x_admin_token="expected-token")

    assert calls == [("expected-token", "expected-token")]
