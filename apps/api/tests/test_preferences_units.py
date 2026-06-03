"""Focused unit tests for app.api.routes.preferences.

Tests the route functions directly (not via TestClient) by mocking
DB and auth dependencies.  Uses in-memory SQLite for ORM operations
and monkeypatch for imported symbols.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.routes.preferences import (
    DEFAULT_PREFERENCES,
    delete_preferences,
    get_preferences,
    put_preferences,
)
from app.db.base import Base
from app.models.tables import Workspace, WorkspacePreference
from app.schemas.preferences import PreferenceDocument, PreferenceUpdate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

T0 = datetime(2026, 6, 3, 12, 0, 0, tzinfo=timezone.utc)


def fake_workspace(slug: str = "test-ws") -> Workspace:
    return Workspace(
        id="ws-test-001",
        slug=slug,
        name=slug.replace("-", " ").title(),
        created_at=T0,
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session():
    """Provide a clean in-memory SQLite session with all tables created."""
    engine = create_engine("sqlite://", future=True)
    Base.metadata.create_all(bind=engine)
    session = Session(bind=engine)
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def patched_prefs(monkeypatch):
    """Monkeypatch external dependencies in the preferences module."""
    import app.api.routes.preferences as prefs_mod

    monkeypatch.setattr(prefs_mod, "utcnow", lambda: T0)
    monkeypatch.setattr(prefs_mod, "require_admin_token", lambda: None)

    def _ensure_workspace(_db, slug):
        return fake_workspace(slug)

    monkeypatch.setattr(prefs_mod, "ensure_workspace", _ensure_workspace)
    return prefs_mod


# ---------------------------------------------------------------------------
# DEFAULT_PREFERENCES
# ---------------------------------------------------------------------------


class TestDefaultPreferences:
    def test_has_expected_keys(self):
        assert set(DEFAULT_PREFERENCES.keys()) == {
            "schema_version",
            "crudeSource",
            "carbonSource",
            "benchmarkMode",
        }

    def test_has_expected_values(self):
        assert DEFAULT_PREFERENCES["schema_version"] == 1
        assert DEFAULT_PREFERENCES["crudeSource"] == "brentEia"
        assert DEFAULT_PREFERENCES["carbonSource"] == "cbamCarbonProxyUsd"
        assert DEFAULT_PREFERENCES["benchmarkMode"] == "live-jet-spot"

    def test_is_not_empty(self):
        assert len(DEFAULT_PREFERENCES) == 4


# ---------------------------------------------------------------------------
# Schema construction
# ---------------------------------------------------------------------------


class TestPreferenceDocument:
    def test_construct_with_defaults(self):
        doc = PreferenceDocument(workspace_slug="my-ws")
        assert doc.workspace_slug == "my-ws"
        assert doc.preferences.schema_version == 1
        assert isinstance(doc.route_edits, dict)

    def test_construct_with_explicit_values(self):
        doc = PreferenceDocument(
            workspace_slug="my-ws",
            preferences={"crudeSource": "brentEia", "benchmarkMode": "live-jet-spot"},
            route_edits={
                "route-1": {"baseCostUsdPerLiter": 1.5},
            },
        )
        assert doc.preferences.crudeSource == "brentEia"
        assert doc.preferences.benchmarkMode == "live-jet-spot"
        assert doc.route_edits["route-1"].baseCostUsdPerLiter == 1.5


class TestPreferenceUpdate:
    def test_construct_with_partial_preferences(self):
        upd = PreferenceUpdate(
            preferences={"crudeSource": "manual", "crudeUsdPerBarrel": 75.0},
        )
        assert upd.preferences.crudeSource == "manual"
        assert upd.preferences.crudeUsdPerBarrel == 75.0
        assert upd.preferences.carbonSource == "manual"  # default

    def test_rejects_nan_in_numeric_field(self):
        with pytest.raises(ValueError, match="finite numbers"):
            PreferenceUpdate(preferences={"crudeUsdPerBarrel": float("nan")})


# ---------------------------------------------------------------------------
# GET /preferences
# ---------------------------------------------------------------------------


class TestGetPreferences:
    def test_returns_defaults_when_no_row(self, db_session, patched_prefs):
        doc = get_preferences(workspace_slug="test-ws", db=db_session)
        assert doc.workspace_slug == "test-ws"
        assert doc.preferences.model_dump(mode="json", exclude_none=True) == DEFAULT_PREFERENCES
        assert doc.route_edits == {}

    def test_returns_saved_row(self, db_session, patched_prefs):
        ws = fake_workspace("test-ws")
        row = WorkspacePreference(
            workspace_id=ws.id,
            preferences={"schema_version": 1, "crudeSource": "brentEia", "carbonSource": "manual", "benchmarkMode": "crude-proxy"},
            route_edits={"r1": {"baseCostUsdPerLiter": 2.0}},
            updated_at=T0,
        )
        db_session.add(row)
        db_session.commit()

        doc = get_preferences(workspace_slug="test-ws", db=db_session)
        assert doc.workspace_slug == "test-ws"
        assert doc.preferences.crudeSource == "brentEia"
        assert doc.preferences.benchmarkMode == "crude-proxy"
        assert doc.route_edits["r1"].baseCostUsdPerLiter == 2.0

    def test_returns_defaults_for_different_workspace(self, db_session, patched_prefs):
        ws = fake_workspace("other-ws")
        ws.id = "ws-other-002"
        row = WorkspacePreference(
            workspace_id=ws.id,
            preferences=dict(DEFAULT_PREFERENCES),
            route_edits={},
            updated_at=T0,
        )
        db_session.add(row)
        db_session.commit()

        doc = get_preferences(workspace_slug="test-ws", db=db_session)
        assert doc.workspace_slug == "test-ws"
        assert doc.preferences.model_dump(mode="json", exclude_none=True) == DEFAULT_PREFERENCES


# ---------------------------------------------------------------------------
# PUT /preferences
# ---------------------------------------------------------------------------


class TestPutPreferences:
    def test_creates_new_row(self, db_session, patched_prefs):
        payload = PreferenceUpdate(
            preferences={"crudeSource": "manual", "crudeUsdPerBarrel": 80.0},
            route_edits={"r1": {"baseCostUsdPerLiter": 1.2}},
        )
        doc = put_preferences(workspace_slug="test-ws", payload=payload, _auth=None, db=db_session)
        assert doc.workspace_slug == "test-ws"
        assert doc.preferences.crudeSource == "manual"
        assert doc.preferences.crudeUsdPerBarrel == 80.0
        assert doc.route_edits["r1"].baseCostUsdPerLiter == 1.2

        row = db_session.scalar(
            __import__("sqlalchemy").select(WorkspacePreference).where(WorkspacePreference.workspace_id == "ws-test-001")
        )
        assert row is not None
        assert row.preferences["crudeSource"] == "manual"

    def test_updates_existing_row(self, db_session, patched_prefs):
        ws = fake_workspace("test-ws")
        db_session.add(
            WorkspacePreference(
                workspace_id=ws.id,
                preferences=dict(DEFAULT_PREFERENCES),
                route_edits={},
                updated_at=T0,
            )
        )
        db_session.commit()

        payload = PreferenceUpdate(
            preferences={"crudeSource": "manual", "carbonSource": "cbamCarbonProxyUsd"},
        )
        doc = put_preferences(workspace_slug="test-ws", payload=payload, _auth=None, db=db_session)
        assert doc.preferences.crudeSource == "manual"
        assert doc.preferences.carbonSource == "cbamCarbonProxyUsd"
        assert doc.preferences.benchmarkMode == "crude-proxy"  # default

    def test_roundtrip_put_then_get(self, db_session, patched_prefs):
        payload = PreferenceUpdate(
            preferences={"crudeSource": "brentFred", "benchmarkMode": "live-jet-spot"},
            route_edits={"r2": {"pathway": "hefa"}},
        )
        put_preferences(workspace_slug="test-ws", payload=payload, _auth=None, db=db_session)
        db_session.commit()

        doc = get_preferences(workspace_slug="test-ws", db=db_session)
        assert doc.preferences.crudeSource == "brentFred"
        assert doc.preferences.benchmarkMode == "live-jet-spot"
        assert doc.route_edits["r2"].pathway == "hefa"


# ---------------------------------------------------------------------------
# DELETE /preferences
# ---------------------------------------------------------------------------


class TestDeletePreferences:
    def test_deletes_existing_row(self, db_session, patched_prefs):
        ws = fake_workspace("test-ws")
        db_session.add(
            WorkspacePreference(
                workspace_id=ws.id,
                preferences=dict(DEFAULT_PREFERENCES),
                route_edits={"r1": {"baseCostUsdPerLiter": 3.0}},
                updated_at=T0,
            )
        )
        db_session.commit()

        result = delete_preferences(workspace_slug="test-ws", _auth=None, db=db_session)
        assert result == {"workspace_slug": "test-ws", "reset": True}

        row = db_session.scalar(
            __import__("sqlalchemy").select(WorkspacePreference).where(WorkspacePreference.workspace_id == "ws-test-001")
        )
        assert row is None

    def test_delete_no_row_returns_reset_true(self, db_session, patched_prefs):
        result = delete_preferences(workspace_slug="test-ws", _auth=None, db=db_session)
        assert result == {"workspace_slug": "test-ws", "reset": True}
