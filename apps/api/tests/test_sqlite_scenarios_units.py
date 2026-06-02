from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api.routes.sqlite_scenarios import (
    create_user_scenario,
    delete_user_scenarios,
    get_user_scenario,
    list_user_scenarios,
    update_user_scenario,
)
from app.models.sqlite_models import UserScenario
from app.schemas.sqlite_schemas import UserScenarioCreate, UserScenarioUpdate


class FakeQuery:
    def __init__(self, results=None, first_result=None):
        self.results = list(results or [])
        self.first_result = first_result
        self.filters = []
        self.order_by_args = []
        self.delete_called = False

    def filter(self, *criteria):
        self.filters.extend(criteria)
        return self

    def order_by(self, *criteria):
        self.order_by_args.extend(criteria)
        return self

    def all(self):
        return self.results

    def first(self):
        return self.first_result

    def delete(self):
        self.delete_called = True
        return len(self.results)


class FakeSession:
    def __init__(self, query):
        self.query_obj = query
        self.added = []
        self.deleted = []
        self.commits = 0
        self.refreshed = []
        self.queried_models = []

    def query(self, model):
        self.queried_models.append(model)
        return self.query_obj

    def add(self, value):
        self.added.append(value)

    def delete(self, value):
        self.deleted.append(value)

    def commit(self):
        self.commits += 1

    def refresh(self, value):
        self.refreshed.append(value)


def make_scenario(**overrides):
    data = {
        "id": "scenario-1",
        "user_id": "user-1",
        "scenario_name": "Base case",
        "description": "Initial description",
        "parameters": {"reserve_weeks": 3},
    }
    data.update(overrides)
    return UserScenario(**data)


def test_create_user_scenario_persists_user_id_and_payload():
    db = FakeSession(FakeQuery())
    payload = UserScenarioCreate(
        scenario_name="Stress case",
        description="High demand",
        parameters={"reserve_weeks": 6, "region": "EU"},
    )

    created = create_user_scenario(payload, user_id="user-42", db=db)

    assert created is db.added[0]
    assert created.user_id == "user-42"
    assert created.scenario_name == "Stress case"
    assert created.description == "High demand"
    assert created.parameters == {"reserve_weeks": 6, "region": "EU"}
    assert db.commits == 1
    assert db.refreshed == [created]


def test_update_user_scenario_applies_only_provided_fields():
    scenario = make_scenario(description="Keep me")
    db = FakeSession(FakeQuery(first_result=scenario))
    payload = UserScenarioUpdate(
        scenario_name="Updated case",
        parameters={"reserve_weeks": 8},
    )

    updated = update_user_scenario("scenario-1", payload, db=db)

    assert updated is scenario
    assert scenario.scenario_name == "Updated case"
    assert scenario.parameters == {"reserve_weeks": 8}
    assert scenario.description == "Keep me"
    assert db.added == [scenario]
    assert db.commits == 1
    assert db.refreshed == [scenario]


def test_get_user_scenario_raises_404_when_missing():
    db = FakeSession(FakeQuery(first_result=None))

    with pytest.raises(HTTPException) as exc_info:
        get_user_scenario("missing-scenario", db=db)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Scenario not found"
    assert db.commits == 0


def test_list_user_scenarios_filters_by_user_and_orders_results():
    scenarios = [make_scenario(id="scenario-1"), make_scenario(id="scenario-2")]
    query = FakeQuery(results=scenarios)
    db = FakeSession(query)

    result = list_user_scenarios(user_id="user-1", db=db)

    assert result == scenarios
    assert db.queried_models == [UserScenario]
    assert len(query.filters) == 1
    assert len(query.order_by_args) == 1


def test_delete_user_scenarios_deletes_matching_rows_and_commits():
    query = FakeQuery(results=[make_scenario()])
    db = FakeSession(query)

    result = delete_user_scenarios(user_id="user-1", db=db)

    assert result is None
    assert query.delete_called is True
    assert len(query.filters) == 1
    assert db.commits == 1

