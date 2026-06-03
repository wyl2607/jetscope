from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.scenarios import (
    create_scenario,
    delete_scenario,
    list_scenarios,
    update_scenario,
)
from app.schemas.scenarios import ScenarioCreate, ScenarioRecord
from app.schemas.state import PreferencesPayload, RouteEditPayload


class _FakeScalarsResult:
    def __init__(self, rows: list):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeDBSession:
    def __init__(self):
        self.added: list = []
        self.committed = False
        self.deleted: list = []
        self._scalar_result = None
        self._scalars_result_list: list = []

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = str(uuid4())
        self.added.append(obj)

    def delete(self, obj):
        self.deleted.append(obj)

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = str(uuid4())

    def scalar(self, _stmt):
        return self._scalar_result

    def scalars(self, _stmt):
        return _FakeScalarsResult(self._scalars_result_list)


class _FakeWorkspace:
    def __init__(self):
        self.id = str(uuid4())
        self.slug = "test-workspace"


class _FakeScenarioRow:
    def __init__(self, **kw):
        self.id = kw.get("id", str(uuid4()))
        self.workspace_id = kw.get("workspace_id", "")
        self.name = kw.get("name", "test-scenario")
        self.preferences = kw.get("preferences", {})
        self.route_edits = kw.get("route_edits", {})
        self.saved_at = kw.get("saved_at", datetime.now(timezone.utc))


def _make_scenario_route():
    from app.api.routes import scenarios as scenarios_route

    return scenarios_route


def _make_payload(**overrides) -> ScenarioCreate:
    kwargs = dict(name="test-scenario", preferences=PreferencesPayload(), route_edits={})
    kwargs.update(overrides)
    return ScenarioCreate(**kwargs)


def _make_full_payload() -> ScenarioCreate:
    return ScenarioCreate(
        name="elaborate",
        preferences=PreferencesPayload(crudeUsdPerBarrel=75.0, carbonPriceUsdPerTonne=42.0),
        route_edits={"hefa": RouteEditPayload(baseCostUsdPerLiter=1.5)},
    )


def _assert_record_matches_payload(record: ScenarioRecord, payload: ScenarioCreate, workspace_slug: str):
    assert record.name == payload.name
    assert record.workspace_slug == workspace_slug
    assert record.preferences.model_dump(mode="json") == payload.preferences.model_dump(mode="json")
    expected_route_edits = {
        rid: re.model_dump(mode="json", exclude_none=True) for rid, re in payload.route_edits.items()
    }
    assert {
        rid: re.model_dump(mode="json", exclude_none=True) for rid, re in record.route_edits.items()
    } == expected_route_edits


class TestListScenarios:
    def test_returns_empty_when_no_scenarios(self, monkeypatch: pytest.MonkeyPatch):
        mod = _make_scenario_route()
        ws = _FakeWorkspace()
        monkeypatch.setattr(mod, "ensure_workspace", lambda db, slug: ws)
        db = _FakeDBSession()

        results = list_scenarios(workspace_slug="test-workspace", db=db)

        assert results == []

    def test_returns_scenario_records(self, monkeypatch: pytest.MonkeyPatch):
        mod = _make_scenario_route()
        ws = _FakeWorkspace()
        monkeypatch.setattr(mod, "ensure_workspace", lambda db, slug: ws)
        db = _FakeDBSession()
        now = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)
        db._scalars_result_list = [
            _FakeScenarioRow(id="s-1", workspace_id=ws.id, name="a", saved_at=now),
            _FakeScenarioRow(id="s-2", workspace_id=ws.id, name="b", saved_at=now),
        ]

        results = list_scenarios(workspace_slug="test-workspace", db=db)

        assert len(results) == 2
        assert results[0].id == "s-1"
        assert results[0].workspace_slug == "test-workspace"
        assert results[0].name == "a"
        assert results[1].name == "b"


class TestCreateScenario:
    def test_adds_and_commits_scenario(self, monkeypatch: pytest.MonkeyPatch):
        mod = _make_scenario_route()
        ws = _FakeWorkspace()
        monkeypatch.setattr(mod, "ensure_workspace", lambda db, slug: ws)
        fake_now = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)
        monkeypatch.setattr(mod, "utcnow", lambda: fake_now)
        db = _FakeDBSession()
        payload = _make_full_payload()

        result = create_scenario(workspace_slug="test-workspace", payload=payload, db=db)

        assert db.committed is True
        assert len(db.added) == 1
        row = db.added[0]
        assert row.name == payload.name
        assert row.preferences == payload.preferences.model_dump(mode="json")
        assert row.saved_at == fake_now
        _assert_record_matches_payload(result, payload, "test-workspace")

    def test_uses_default_preferences_when_not_provided(self, monkeypatch: pytest.MonkeyPatch):
        mod = _make_scenario_route()
        ws = _FakeWorkspace()
        monkeypatch.setattr(mod, "ensure_workspace", lambda db, slug: ws)
        monkeypatch.setattr(mod, "utcnow", lambda: datetime.now(timezone.utc))
        db = _FakeDBSession()
        payload = ScenarioCreate(name="minimal")

        result = create_scenario(workspace_slug="ws", payload=payload, db=db)

        assert result.name == "minimal"
        assert isinstance(result.preferences.model_dump(mode="json"), dict)
        assert len(db.added) == 1


class TestUpdateScenario:
    def test_raises_404_when_not_found(self, monkeypatch: pytest.MonkeyPatch):
        mod = _make_scenario_route()
        ws = _FakeWorkspace()
        monkeypatch.setattr(mod, "ensure_workspace", lambda db, slug: ws)
        db = _FakeDBSession()
        db._scalar_result = None
        payload = _make_payload()

        with pytest.raises(HTTPException) as exc:
            update_scenario(workspace_slug="test", scenario_id="missing", payload=payload, db=db)
        assert exc.value.status_code == 404

    def test_updates_fields_and_commits(self, monkeypatch: pytest.MonkeyPatch):
        mod = _make_scenario_route()
        ws = _FakeWorkspace()
        monkeypatch.setattr(mod, "ensure_workspace", lambda db, slug: ws)
        fake_now = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)
        monkeypatch.setattr(mod, "utcnow", lambda: fake_now)
        db = _FakeDBSession()
        original = _FakeScenarioRow(workspace_id=ws.id)
        db._scalar_result = original
        payload = _make_full_payload()

        result = update_scenario(
            workspace_slug="test-workspace", scenario_id=original.id, payload=payload, db=db
        )

        assert original.name == payload.name
        assert original.preferences == payload.preferences.model_dump(mode="json")
        assert original.saved_at == fake_now
        assert db.committed is True
        _assert_record_matches_payload(result, payload, "test-workspace")


class TestDeleteScenario:
    def test_raises_404_when_not_found(self, monkeypatch: pytest.MonkeyPatch):
        mod = _make_scenario_route()
        ws = _FakeWorkspace()
        monkeypatch.setattr(mod, "ensure_workspace", lambda db, slug: ws)
        db = _FakeDBSession()
        db._scalar_result = None

        with pytest.raises(HTTPException) as exc:
            delete_scenario(workspace_slug="test", scenario_id="missing", db=db)
        assert exc.value.status_code == 404

    def test_deletes_and_commits(self, monkeypatch: pytest.MonkeyPatch):
        mod = _make_scenario_route()
        ws = _FakeWorkspace()
        monkeypatch.setattr(mod, "ensure_workspace", lambda db, slug: ws)
        db = _FakeDBSession()
        scenario = _FakeScenarioRow(workspace_id=ws.id)
        db._scalar_result = scenario

        result = delete_scenario(workspace_slug="test-workspace", scenario_id=scenario.id, db=db)

        assert db.deleted == [scenario]
        assert db.committed is True
        assert result == {
            "workspace_slug": "test-workspace",
            "scenario_id": scenario.id,
            "deleted": True,
        }
