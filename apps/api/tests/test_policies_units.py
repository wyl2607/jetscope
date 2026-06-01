from __future__ import annotations

from dataclasses import dataclass
import importlib.util
import sys
import types
from pathlib import Path


class _FakeColumn:
    def __init__(self, name: str):
        self.name = name

    def asc(self):
        return ("asc", self.name)

    def __eq__(self, other):
        return ("eq", self.name, other)


class _FakeSelect:
    def __init__(self, model_or_column):
        self.model_or_column = model_or_column
        self._limit = None
        self._order_by = None
        self._where = None

    def limit(self, n: int):
        self._limit = n
        return self

    def order_by(self, expr):
        self._order_by = expr
        return self

    def where(self, expr):
        self._where = expr
        return self


@dataclass
class _FakeRefuelEuTarget:
    year: int
    saf_share_pct: float
    synthetic_share_pct: float
    label: str


_FakeRefuelEuTarget.year = _FakeColumn("year")


class _FakeScalarsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class _FakeSession:
    def __init__(self):
        self.rows: dict[int, _FakeRefuelEuTarget] = {}
        self.commits = 0

    def scalar(self, query: _FakeSelect):
        target = query.model_or_column
        if isinstance(target, _FakeColumn) and target.name == "year":
            if not self.rows:
                return None
            first_year = sorted(self.rows.keys())[0]
            return first_year

        if target is _FakeRefuelEuTarget and query._where is not None:
            op, col, year = query._where
            if op == "eq" and col == "year":
                return self.rows.get(year)

        return None

    def scalars(self, query: _FakeSelect):
        rows = sorted(self.rows.values(), key=lambda row: row.year)
        return _FakeScalarsResult(rows)

    def add(self, row: _FakeRefuelEuTarget):
        self.rows[row.year] = row

    def commit(self):
        self.commits += 1


def _load_policies_module():
    repo_root = Path(__file__).resolve().parents[3]
    module_path = repo_root / "apps/api/app/api/routes/policies.py"

    fastapi_mod = types.ModuleType("fastapi")

    class APIRouter:
        def get(self, *_args, **_kwargs):
            return lambda fn: fn

        def put(self, *_args, **_kwargs):
            return lambda fn: fn

    fastapi_mod.APIRouter = APIRouter
    fastapi_mod.Depends = lambda dependency: dependency

    sqlalchemy_mod = types.ModuleType("sqlalchemy")
    sqlalchemy_mod.select = lambda model_or_column: _FakeSelect(model_or_column)

    sqlalchemy_orm_mod = types.ModuleType("sqlalchemy.orm")
    sqlalchemy_orm_mod.Session = object

    app_db_session_mod = types.ModuleType("app.db.session")
    app_db_session_mod.get_db = lambda: None

    app_models_tables_mod = types.ModuleType("app.models.tables")
    app_models_tables_mod.RefuelEuTarget = _FakeRefuelEuTarget

    class _PolicyTarget:
        def __init__(self, year, saf_share_pct, synthetic_share_pct, label):
            self.year = year
            self.saf_share_pct = saf_share_pct
            self.synthetic_share_pct = synthetic_share_pct
            self.label = label

    app_schemas_policies_mod = types.ModuleType("app.schemas.policies")
    app_schemas_policies_mod.PolicyTarget = _PolicyTarget

    app_security_mod = types.ModuleType("app.security")
    app_security_mod.require_admin_token = lambda: None

    for name, module in {
        "fastapi": fastapi_mod,
        "sqlalchemy": sqlalchemy_mod,
        "sqlalchemy.orm": sqlalchemy_orm_mod,
        "app.db.session": app_db_session_mod,
        "app.models.tables": app_models_tables_mod,
        "app.schemas.policies": app_schemas_policies_mod,
        "app.security": app_security_mod,
    }.items():
        sys.modules[name] = module

    spec = importlib.util.spec_from_file_location("test_real_policies_module", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    spec.loader.exec_module(module)
    return module


policies_route = _load_policies_module()


def test_seed_policies_if_needed_populates_defaults_once():
    db = _FakeSession()

    policies_route._seed_policies_if_needed(db)
    first_count = len(db.rows)
    policies_route._seed_policies_if_needed(db)

    assert first_count == len(policies_route.DEFAULT_POLICY_TARGETS)
    assert len(db.rows) == len(policies_route.DEFAULT_POLICY_TARGETS)
    assert db.commits == 1


def test_list_policy_rows_returns_seeded_rows_sorted_by_year():
    db = _FakeSession()

    rows = policies_route._list_policy_rows(db)

    assert [row.year for row in rows] == [2030, 2035, 2050]
    assert rows[0].label == "Early scale-up"
    assert rows[-1].synthetic_share_pct == 35


def test_upsert_refuel_eu_targets_updates_and_inserts_rows():
    db = _FakeSession()
    policies_route._seed_policies_if_needed(db)

    payload = [
        policies_route.PolicyTarget(year=2035, saf_share_pct=25, synthetic_share_pct=6.5, label="Updated 2035"),
        policies_route.PolicyTarget(year=2040, saf_share_pct=35, synthetic_share_pct=10, label="Inserted 2040"),
    ]

    returned = policies_route.upsert_refuel_eu_targets(payload=payload, _auth=None, db=db)

    assert [item.year for item in returned] == [2030, 2035, 2040, 2050]
    assert db.rows[2035].saf_share_pct == 25
    assert db.rows[2035].label == "Updated 2035"
    assert db.rows[2040].synthetic_share_pct == 10
