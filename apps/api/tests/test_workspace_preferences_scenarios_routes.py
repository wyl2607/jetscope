from pathlib import Path

import importlib
import sys
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.models import Scenario, Workspace, WorkspacePreference

TEST_ADMIN_TOKEN = "test-admin-token"
ADMIN_HEADERS = {"X-Admin-Token": TEST_ADMIN_TOKEN}


@pytest.fixture
def api_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "admin_token", TEST_ADMIN_TOKEN)

    original_sqlalchemy_module = sys.modules.get("sqlalchemy")
    original_sqlalchemy_orm_module = sys.modules.get("sqlalchemy.orm")
    sys.modules.pop("sqlalchemy", None)
    sys.modules.pop("sqlalchemy.orm", None)
    try:
        sqlalchemy = importlib.import_module("sqlalchemy")
        orm = importlib.import_module("sqlalchemy.orm")
    finally:
        if original_sqlalchemy_module is not None:
            sys.modules["sqlalchemy"] = original_sqlalchemy_module
        else:
            sys.modules.pop("sqlalchemy", None)
        if original_sqlalchemy_orm_module is not None:
            sys.modules["sqlalchemy.orm"] = original_sqlalchemy_orm_module
        else:
            sys.modules.pop("sqlalchemy.orm", None)

    engine = sqlalchemy.create_engine(
        f"sqlite:///{tmp_path / 'workspace_preferences_scenarios.sqlite3'}",
        future=True,
    )
    SessionLocal = orm.sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        future=True,
    )
    Base.metadata.create_all(bind=engine)

    app = FastAPI(title="workspace-preferences-scenarios-route-test")
    app.include_router(api_router, prefix="/v1")

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    client = TestClient(app)

    try:
        yield client, SessionLocal
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


def _workspace_id(db, workspace_slug: str) -> str:
    workspace = db.query(Workspace).filter(Workspace.slug == workspace_slug).first()
    return None if workspace is None else workspace.id


def _assert_dict_includes(payload: dict, expected: dict) -> None:
    for key, value in expected.items():
        assert key in payload
        if isinstance(value, dict) and isinstance(payload[key], dict):
            for child_key, child_value in value.items():
                assert payload[key][child_key] == child_value
        else:
            assert payload[key] == value


def _count_workspace_preference_rows(db, workspace_slug: str) -> int:
    workspace_id = _workspace_id(db, workspace_slug)
    if workspace_id is None:
        return 0
    return (
        db.query(WorkspacePreference)
        .filter(WorkspacePreference.workspace_id == workspace_id)
        .count()
    )


def test_preferences_get_defaults_without_saved_record(api_client):
    client, _session_local = api_client

    response = client.get("/v1/workspaces/demo/preferences")

    assert response.status_code == 200
    payload = response.json()
    assert payload["workspace_slug"] == "demo"
    assert payload["route_edits"] == {}
    _assert_dict_includes(
        payload["preferences"],
        {
        "schema_version": 1,
        "crudeSource": "brentEia",
        "carbonSource": "cbamCarbonProxyUsd",
        "benchmarkMode": "live-jet-spot",
        },
    )


def test_preferences_put_persists_preferences_and_is_readable(api_client):
    client, _session_local = api_client

    put_payload = {
        "preferences": {
            "schema_version": 2,
            "crudeSource": "manual",
            "carbonSource": "manual",
            "benchmarkMode": "crude-proxy",
            "crudeUsdPerBarrel": 82.4,
        },
        "route_edits": {
            "route-a": {
                "baseCostUsdPerLiter": 0.32,
                "co2SavingsKgPerLiter": 2.1,
            }
        },
    }

    put_response = client.put("/v1/workspaces/demo/preferences", headers=ADMIN_HEADERS, json=put_payload)
    assert put_response.status_code == 200
    assert put_response.json()["preferences"]["crudeSource"] == "manual"
    assert put_response.json()["preferences"]["benchmarkMode"] == "crude-proxy"

    get_response = client.get("/v1/workspaces/demo/preferences")
    assert get_response.status_code == 200
    payload = get_response.json()
    assert payload["workspace_slug"] == "demo"
    _assert_dict_includes(payload["preferences"], put_payload["preferences"])
    _assert_dict_includes(payload["route_edits"], put_payload["route_edits"])


def test_preferences_put_updates_existing_workspace_record_in_place(api_client):
    client, session_local = api_client

    client.put(
        "/v1/workspaces/demo/preferences",
        headers=ADMIN_HEADERS,
        json={
            "preferences": {
                "schema_version": 1,
                "crudeSource": "manual",
                "carbonSource": "manual",
                "benchmarkMode": "crude-proxy",
            },
        },
    )
    client.put(
        "/v1/workspaces/demo/preferences",
        headers=ADMIN_HEADERS,
        json={
            "preferences": {
                "schema_version": 2,
                "crudeSource": "brentFred",
                "carbonSource": "cbamCarbonProxyUsd",
                "benchmarkMode": "live-jet-spot",
            },
        },
    )

    with session_local() as db:
        assert _count_workspace_preference_rows(db, "demo") == 1
        workspace_id = _workspace_id(db, "demo")
        row = (
            db.query(WorkspacePreference)
            .filter(WorkspacePreference.workspace_id == workspace_id)
            .first()
        )
        assert row.preferences["crudeSource"] == "brentFred"
        assert row.preferences["benchmarkMode"] == "live-jet-spot"


def test_preferences_delete_resets_to_defaults(api_client):
    client, session_local = api_client

    client.put(
        "/v1/workspaces/demo/preferences",
        headers=ADMIN_HEADERS,
        json={"preferences": {"schema_version": 2, "crudeSource": "manual", "carbonSource": "manual", "benchmarkMode": "crude-proxy"}},
    )

    delete_response = client.delete("/v1/workspaces/demo/preferences", headers=ADMIN_HEADERS)
    assert delete_response.status_code == 200
    delete_payload = delete_response.json()
    assert delete_payload["workspace_slug"] == "demo"
    assert delete_payload["reset"] is True

    get_response = client.get("/v1/workspaces/demo/preferences")
    assert get_response.status_code == 200
    payload = get_response.json()
    _assert_dict_includes(
        payload["preferences"],
        {
        "schema_version": 1,
        "crudeSource": "brentEia",
        "carbonSource": "cbamCarbonProxyUsd",
        "benchmarkMode": "live-jet-spot",
        },
    )
    assert payload["route_edits"] == {}

    with session_local() as db:
        workspace_id = _workspace_id(db, "demo")
        assert workspace_id is not None
        assert (
            db.query(WorkspacePreference)
            .filter(WorkspacePreference.workspace_id == workspace_id)
            .first()
            is None
        )


def test_workspace_preferences_are_isolated_between_slugs(api_client):
    client, session_local = api_client

    client.put(
        "/v1/workspaces/demo/preferences",
        headers=ADMIN_HEADERS,
        json={"preferences": {"schema_version": 2, "crudeSource": "manual", "carbonSource": "manual", "benchmarkMode": "crude-proxy"}},
    )
    client.put(
        "/v1/workspaces/other/preferences",
        headers=ADMIN_HEADERS,
        json={"preferences": {"schema_version": 2, "crudeSource": "brentFred", "carbonSource": "cbamCarbonProxyUsd", "benchmarkMode": "live-jet-spot"}},
    )

    demo_get = client.get("/v1/workspaces/demo/preferences")
    other_get = client.get("/v1/workspaces/other/preferences")

    assert demo_get.status_code == 200
    assert other_get.status_code == 200
    demo_payload = demo_get.json()
    other_payload = other_get.json()
    assert demo_payload["preferences"]["crudeSource"] == "manual"
    assert other_payload["preferences"]["crudeSource"] == "brentFred"

    with session_local() as db:
        demo_id = _workspace_id(db, "demo")
        other_id = _workspace_id(db, "other")
        assert demo_id != other_id
        assert _count_workspace_preference_rows(db, "demo") == 1
        assert _count_workspace_preference_rows(db, "other") == 1


def _create_scenario(client: TestClient, workspace_slug: str, name: str) -> dict:
    response = client.post(
        f"/v1/workspaces/{workspace_slug}/scenarios",
        headers=ADMIN_HEADERS,
        json={
            "name": name,
            "preferences": {
                "schema_version": 1,
                "crudeSource": "manual",
                "carbonSource": "manual",
                "benchmarkMode": "crude-proxy",
            },
            "route_edits": {
                "route-a": {
                    "baseCostUsdPerLiter": 0.31,
                    "name": "Legacy base",
                }
            },
        },
    )
    assert response.status_code == 200
    return response.json()


def test_scenarios_list_is_initially_empty(api_client):
    client, _session_local = api_client

    response = client.get("/v1/workspaces/demo/scenarios")

    assert response.status_code == 200
    assert response.json() == []


def test_scenarios_post_create_returns_normalized_name_and_is_listed(api_client):
    client, _session_local = api_client

    payload = _create_scenario(client, "demo", "  EU disruption drill  ")

    assert payload["workspace_slug"] == "demo"
    assert payload["name"] == "EU disruption drill"
    assert payload["id"]
    assert payload["preferences"]["schema_version"] == 1
    assert payload["route_edits"]["route-a"]["baseCostUsdPerLiter"] == 0.31
    assert payload["route_edits"]["route-a"]["name"] == "Legacy base"

    list_response = client.get("/v1/workspaces/demo/scenarios")
    assert list_response.status_code == 200
    entries = list_response.json()
    assert len(entries) == 1
    assert entries[0]["id"] == payload["id"]
    assert entries[0]["name"] == "EU disruption drill"
    assert entries[0]["workspace_slug"] == "demo"


def test_scenarios_put_updates_record_name_preferences_route_edits(api_client):
    client, session_local = api_client

    created = _create_scenario(client, "demo", "base")
    scenario_id = created["id"]

    response = client.put(
        f"/v1/workspaces/demo/scenarios/{scenario_id}",
        headers=ADMIN_HEADERS,
        json={
            "name": "  Stress test  ",
            "preferences": {
                "schema_version": 2,
                "crudeSource": "brentFred",
                "carbonSource": "cbamCarbonProxyUsd",
                "benchmarkMode": "live-jet-spot",
                "subsidyUsdPerLiter": 0.05,
            },
            "route_edits": {
                "route-a": {
                    "co2SavingsKgPerLiter": 4.1,
                    "pathway": "renewable",
                }
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Stress test"
    assert body["preferences"]["schema_version"] == 2
    assert body["route_edits"]["route-a"]["co2SavingsKgPerLiter"] == 4.1

    list_response = client.get("/v1/workspaces/demo/scenarios")
    assert list_response.status_code == 200
    entries = list_response.json()
    assert len(entries) == 1
    assert entries[0]["id"] == scenario_id
    assert entries[0]["name"] == "Stress test"


def test_scenarios_delete_removes_scenario(api_client):
    client, _session_local = api_client

    created = _create_scenario(client, "demo", "to-delete")
    scenario_id = created["id"]

    delete_response = client.delete(
        f"/v1/workspaces/demo/scenarios/{scenario_id}",
        headers=ADMIN_HEADERS,
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True

    list_response = client.get("/v1/workspaces/demo/scenarios")
    assert list_response.status_code == 200
    assert list_response.json() == []


def test_scenarios_put_and_delete_missing_id_return_404(api_client):
    client, _session_local = api_client

    put_response = client.put(
        "/v1/workspaces/demo/scenarios/missing-id",
        headers=ADMIN_HEADERS,
        json={"name": "does-not-matter"},
    )
    assert put_response.status_code == 404
    assert put_response.json()["detail"] == "Scenario not found"

    delete_response = client.delete(
        "/v1/workspaces/demo/scenarios/missing-id",
        headers=ADMIN_HEADERS,
    )
    assert delete_response.status_code == 404
    assert delete_response.json()["detail"] == "Scenario not found"


def test_scenarios_workspace_isolation_on_update_and_delete(api_client):
    client, session_local = api_client

    created = _create_scenario(client, "demo", "demo only")
    scenario_id = created["id"]

    update_other = client.put(
        f"/v1/workspaces/other/scenarios/{scenario_id}",
        headers=ADMIN_HEADERS,
        json={"name": "blocked"},
    )
    assert update_other.status_code == 404

    delete_other = client.delete(
        f"/v1/workspaces/other/scenarios/{scenario_id}",
        headers=ADMIN_HEADERS,
    )
    assert delete_other.status_code == 404

    list_response = client.get("/v1/workspaces/demo/scenarios")
    assert list_response.status_code == 200
    entries = list_response.json()
    assert len(entries) == 1
    assert entries[0]["id"] == scenario_id

    with session_local() as db:
        demo_workspace_id = _workspace_id(db, "demo")
        other_workspace_id = _workspace_id(db, "other")
        assert demo_workspace_id is not None
        assert other_workspace_id is not None
        demo_count = (
            db.query(Scenario).filter(Scenario.workspace_id == demo_workspace_id).count()
        )
        other_count = (
            db.query(Scenario).filter(Scenario.workspace_id == other_workspace_id).count()
        )
        assert demo_count == 1
        assert other_count == 0
