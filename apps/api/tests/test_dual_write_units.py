"""Focused unit tests for app.db.dual_write.

Tests run offline using monkeypatched sessions and importlib.reload
to exercise each migration phase.
"""

from __future__ import annotations

import importlib
import os
from typing import Generator

import pytest
from sqlalchemy.orm import Session


class FakeSession:
    """Minimal fake sqlalchemy Session that tracks close()."""

    def __init__(self, name: str):
        self.name = name
        self.closed = False

    def close(self):
        self.closed = True


def _make_fake_get_db(name: str):
    """Return a generator function that yields a single FakeSession."""

    def _gen(*args, **kwargs) -> Generator[Session, None, None]:
        yield FakeSession(name)  # type: ignore[arg-type]

    return _gen


@pytest.fixture(autouse=True)
def _dual_write_module(request, monkeypatch):
    """Load migration settings per test and restore module state afterwards."""
    phase = getattr(request, "param", {}).get("phase", "phase1")
    pct = getattr(request, "param", {}).get("pct", "0")
    mod = importlib.import_module("app.db.dual_write")

    with monkeypatch.context() as patch:
        patch.setenv("DUAL_WRITE_PHASE", phase)
        patch.setenv("READ_POSTGRES_PCT", pct)
        importlib.reload(mod)
        patch.setattr(mod, "get_sqlite_db", _make_fake_get_db("sqlite"))
        patch.setattr(mod, "get_postgres_db", _make_fake_get_db("postgres"))
        yield mod

    # Reload after the context restores environment and attributes so no
    # phase constants or fake session factories leak into later test modules.
    importlib.reload(mod)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestGetWriteDbs:
    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase1", "pct": "0"}, {"phase": "phase2", "pct": "50"}],
        indirect=True,
    )
    def test_phase1_and_2_yield_both_dbs(self, _dual_write_module):
        dbs = list(_dual_write_module.get_write_dbs())
        assert len(dbs) == 2
        assert dbs[0].name == "sqlite"
        assert dbs[1].name == "postgres"

    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase3", "pct": "100"}],
        indirect=True,
    )
    def test_phase3_yields_only_postgres(self, _dual_write_module):
        dbs = list(_dual_write_module.get_write_dbs())
        assert len(dbs) == 1
        assert dbs[0].name == "postgres"


class TestDualWriteContext:
    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase1"}],
        indirect=True,
    )
    def test_context_closes_all_sessions(self, _dual_write_module):
        with _dual_write_module.dual_write_context() as sessions:
            assert len(sessions) == 2
            for s in sessions:
                assert not s.closed
        for s in sessions:
            assert s.closed, f"{s.name} was not closed"

    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase3"}],
        indirect=True,
    )
    def test_context_phase3_closes_single_session(self, _dual_write_module):
        with _dual_write_module.dual_write_context() as sessions:
            assert len(sessions) == 1
            assert sessions[0].name == "postgres"
            assert not sessions[0].closed
        assert sessions[0].closed


class TestGetReadDb:
    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase1", "pct": "0"}],
        indirect=True,
    )
    def test_phase1_pct0_returns_sqlite(self, _dual_write_module):
        dbs = list(_dual_write_module.get_read_db())
        assert len(dbs) == 1
        assert dbs[0].name == "sqlite"

    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase2", "pct": "100"}],
        indirect=True,
    )
    def test_phase2_pct100_returns_postgres(self, _dual_write_module, monkeypatch):
        dbs = list(_dual_write_module.get_read_db())
        assert len(dbs) == 1
        assert dbs[0].name == "postgres"

    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase3", "pct": "0"}],
        indirect=True,
    )
    def test_phase3_always_postgres_even_when_pct0(self, _dual_write_module):
        """Phase 3 forces pct to 100 regardless of the env var."""
        dbs = list(_dual_write_module.get_read_db())
        assert len(dbs) == 1
        assert dbs[0].name == "postgres"

    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase2", "pct": "50"}],
        indirect=True,
    )
    def test_phase2_pct50_can_return_either(self, _dual_write_module, monkeypatch):
        """With pct=50 we control random to force each path."""
        import app.db.dual_write as dw

        monkeypatch.setattr(dw.random, "randint", lambda lo, hi: 1)
        assert list(dw.get_read_db())[0].name == "postgres"

        monkeypatch.setattr(dw.random, "randint", lambda lo, hi: 100)
        assert list(dw.get_read_db())[0].name == "sqlite"


class TestIsPostgresPrimary:
    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase1", "pct": "50"}, {"phase": "phase2", "pct": "99"}],
        indirect=True,
    )
    def test_false_when_below_100(self, _dual_write_module):
        assert not _dual_write_module.is_postgres_primary()

    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase3"}, {"phase": "phase2", "pct": "100"}],
        indirect=True,
    )
    def test_true_when_phase3_or_pct_100(self, _dual_write_module):
        assert _dual_write_module.is_postgres_primary()


class TestMigrationStatus:
    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase1", "pct": "0"}],
        indirect=True,
    )
    def test_phase1_status(self, _dual_write_module):
        status = _dual_write_module.migration_status()
        assert status == {
            "phase": "phase1",
            "read_postgres_pct": 0,
            "postgres_primary": False,
            "write_targets": ["sqlite", "postgres"],
        }

    @pytest.mark.parametrize(
        "_dual_write_module",
        [{"phase": "phase3", "pct": "100"}],
        indirect=True,
    )
    def test_phase3_status(self, _dual_write_module):
        status = _dual_write_module.migration_status()
        assert status == {
            "phase": "phase3",
            "read_postgres_pct": 100,
            "postgres_primary": True,
            "write_targets": ["postgres"],
        }
