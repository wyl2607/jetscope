from __future__ import annotations

import importlib
import sys
import types
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

# Ensure `app.*` imports resolve when running pytest from repo root.
API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class _HTTPException(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class _APIRouter:
    def get(self, *_args, **_kwargs):
        return lambda fn: fn

    def post(self, *_args, **_kwargs):
        return lambda fn: fn

    def put(self, *_args, **_kwargs):
        return lambda fn: fn

    def delete(self, *_args, **_kwargs):
        return lambda fn: fn


@dataclass
class _FakeCondition:
    expr: str


class _FakeField:
    def __init__(self, label: str):
        self.label = label

    def __eq__(self, other):
        return _FakeCondition(f"{self.label}=={other}")

    def desc(self):
        return f"{self.label}.desc"


class _FakeSelect:
    def __init__(self, model):
        self.model = model
        self.where_args = []
        self.order_by_arg = None

    def where(self, *args):
        self.where_args.extend(args)
        return self

    def order_by(self, arg):
        self.order_by_arg = arg
        return self


class _FakeScenarioModel:
    id = _FakeField("id")
    workspace_id = _FakeField("workspace_id")
    saved_at = _FakeField("saved_at")

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.id = kwargs.get("id")


def _fake_select(model):
    return _FakeSelect(model)


class _ScenarioRecord:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class _ScenarioCreate:
    pass


class _Dumpable:
    def __init__(self, data: dict):
        self._data = data

    def model_dump(self, mode: str = "json", exclude_none: bool = False):
        payload = dict(self._data)
        if exclude_none:
            payload = {key: value for key, value in payload.items() if value is not None}
        return payload


def _install_import_stubs():
    fake_fastapi = types.ModuleType("fastapi")
    fake_fastapi.APIRouter = _APIRouter
    fake_fastapi.Depends = lambda dep: dep
    fake_fastapi.HTTPException = _HTTPException

    fake_sqlalchemy = types.ModuleType("sqlalchemy")
    fake_sqlalchemy.select = _fake_select

    fake_sqlalchemy_orm = types.ModuleType("sqlalchemy.orm")
    fake_sqlalchemy_orm.Session = object

    fake_db_session = types.ModuleType("app.db.session")
    fake_db_session.get_db = lambda: None

    fake_models_tables = types.ModuleType("app.models.tables")
    fake_models_tables.Scenario = _FakeScenarioModel

    fake_schemas = types.ModuleType("app.schemas.scenarios")
    fake_schemas.ScenarioCreate = _ScenarioCreate
    fake_schemas.ScenarioRecord = _ScenarioRecord

    fake_security = types.ModuleType("app.security")
    fake_security.require_admin_token = lambda: None

    fake_services_bootstrap = types.ModuleType("app.services.bootstrap")
    fake_services_bootstrap.ensure_workspace = lambda _db, slug: SimpleNamespace(id=f"ws-{slug}")
    fake_services_bootstrap.utcnow = lambda: datetime(2026, 1, 1, tzinfo=timezone.utc)

    stubs = {
        "fastapi": fake_fastapi,
        "sqlalchemy": fake_sqlalchemy,
        "sqlalchemy.orm": fake_sqlalchemy_orm,
        "app.db.session": fake_db_session,
        "app.models.tables": fake_models_tables,
        "app.schemas.scenarios": fake_schemas,
        "app.security": fake_security,
        "app.services.bootstrap": fake_services_bootstrap,
    }

    originals = {name: sys.modules.get(name) for name in stubs}
    sys.modules.update(stubs)
    return originals


_ORIGINALS = _install_import_stubs()
try:
    scenarios = importlib.import_module("app.api.routes.scenarios")
finally:
    for _name, _orig in _ORIGINALS.items():
        if _orig is None:
            sys.modules.pop(_name, None)
        else:
            sys.modules[_name] = _orig


class FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class FakeDB:
    def __init__(self, *, scalar_result=None, scalars_result=None):
        self.scalar_result = scalar_result
        self.scalars_result = scalars_result or []
        self.added = []
        self.deleted = []
        self.committed = 0
        self.refreshed = []

    def scalar(self, _query):
        return self.scalar_result

    def scalars(self, _query):
        return FakeScalarResult(self.scalars_result)

    def add(self, row):
        self.added.append(row)

    def delete(self, row):
        self.deleted.append(row)

    def commit(self):
        self.committed += 1

    def refresh(self, row):
        self.refreshed.append(row)


@pytest.fixture
def payload() -> SimpleNamespace:
    return SimpleNamespace(
        name="Scenario A",
        preferences=_Dumpable({"crudeSource": "manual", "crudeUsdPerBarrel": 85.5}),
        route_edits={
            "hefa": _Dumpable(
                {
                    "baseCostUsdPerLiter": 1.23,
                    "co2SavingsKgPerLiter": 2.2,
                    "pathway": "HEFA",
                    "name": "HEFA Route",
                }
            ),
            "atj": _Dumpable({"name": "ATJ", "pathway": "ATJ", "baseCostUsdPerLiter": None}),
        },
    )


def test_list_scenarios_maps_rows_to_records(monkeypatch):
    fake_workspace = SimpleNamespace(id="ws-1")
    fake_rows = [
        SimpleNamespace(
            id="s2",
            name="Second",
            saved_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            preferences={"schema_version": 1},
            route_edits={"hefa": {"name": "HEFA"}},
        ),
        SimpleNamespace(
            id="s1",
            name="First",
            saved_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            preferences={"schema_version": 1},
            route_edits={},
        ),
    ]
    db = FakeDB(scalars_result=fake_rows)
    monkeypatch.setattr(scenarios, "ensure_workspace", lambda _db, _slug: fake_workspace)

    result = scenarios.list_scenarios("acme", db)

    assert [item.id for item in result] == ["s2", "s1"]
    assert all(item.workspace_slug == "acme" for item in result)
    assert result[0].route_edits["hefa"]["name"] == "HEFA"


def test_create_scenario_serializes_payload_and_persists(monkeypatch, payload):
    fake_workspace = SimpleNamespace(id="ws-42")
    fixed_now = datetime(2026, 2, 2, 9, 30, tzinfo=timezone.utc)
    db = FakeDB()
    monkeypatch.setattr(scenarios, "ensure_workspace", lambda _db, _slug: fake_workspace)
    monkeypatch.setattr(scenarios, "utcnow", lambda: fixed_now)

    def _refresh(row):
        row.id = "scenario-new"

    db.refresh = _refresh

    result = scenarios.create_scenario("jetscope", payload, db=db)

    assert len(db.added) == 1
    added = db.added[0]
    assert added.workspace_id == "ws-42"
    assert added.saved_at == fixed_now
    assert added.preferences["crudeUsdPerBarrel"] == 85.5
    assert added.route_edits["hefa"]["baseCostUsdPerLiter"] == 1.23
    assert "baseCostUsdPerLiter" not in added.route_edits["atj"]
    assert db.committed == 1
    assert result.id == "scenario-new"
    assert result.workspace_slug == "jetscope"


def test_update_scenario_raises_404_when_missing(monkeypatch, payload):
    fake_workspace = SimpleNamespace(id="ws-404")
    db = FakeDB(scalar_result=None)
    monkeypatch.setattr(scenarios, "ensure_workspace", lambda _db, _slug: fake_workspace)

    with pytest.raises(scenarios.HTTPException) as exc:
        scenarios.update_scenario("jetscope", "missing-id", payload, db=db)

    assert exc.value.status_code == 404
    assert exc.value.detail == "Scenario not found"
    assert db.committed == 0


def test_delete_scenario_deletes_matching_row(monkeypatch):
    fake_workspace = SimpleNamespace(id="ws-9")
    row = SimpleNamespace(id="scenario-1")
    db = FakeDB(scalar_result=row)
    monkeypatch.setattr(scenarios, "ensure_workspace", lambda _db, _slug: fake_workspace)

    result = scenarios.delete_scenario("acme", "scenario-1", db=db)

    assert db.deleted == [row]
    assert db.committed == 1
    assert result == {
        "workspace_slug": "acme",
        "scenario_id": "scenario-1",
        "deleted": True,
    }
