"""Focused unit tests for sqlite_scenarios route functions.

Tests CRUD logic directly by calling route functions with a real in-memory
SQLite database, mocking only the DB dependency injection.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.routes.sqlite_scenarios import (
    create_user_scenario,
    delete_user_scenario,
    delete_user_scenarios,
    get_user_scenario,
    list_user_scenarios,
    update_user_scenario,
)
from app.db.base import Base
from app.models.sqlite_models import UserScenario
from app.schemas.sqlite_schemas import UserScenarioCreate, UserScenarioUpdate


@pytest.fixture
def db_session():
    """In-memory SQLite with created tables, cleaned up after each test."""
    engine = create_engine("sqlite://", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, future=True
    )
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Create + List
# ---------------------------------------------------------------------------


def test_create_and_list_user_scenarios(db_session):
    user_id = "test-user-crud"
    data = UserScenarioCreate(
        scenario_name="Base case",
        description="Test scenario description",
        parameters={"reserve_weeks": 4, "carbon_price": 95},
    )

    created = create_user_scenario(scenario_data=data, user_id=user_id, db=db_session)

    assert created.user_id == user_id
    assert created.scenario_name == "Base case"
    assert created.parameters == {"reserve_weeks": 4, "carbon_price": 95}
    assert created.description == "Test scenario description"
    assert created.id is not None
    assert isinstance(created.created_at, datetime)

    scenarios = list_user_scenarios(user_id=user_id, db=db_session)

    assert len(scenarios) == 1
    assert scenarios[0].id == created.id
    assert scenarios[0].scenario_name == "Base case"


def test_list_scenarios_returns_only_requested_user(db_session):
    user_a = "user-a"
    user_b = "user-b"

    create_user_scenario(
        UserScenarioCreate(scenario_name="A1", parameters={"v": 1}),
        user_id=user_a,
        db=db_session,
    )
    create_user_scenario(
        UserScenarioCreate(scenario_name="B1", parameters={"v": 2}),
        user_id=user_b,
        db=db_session,
    )
    create_user_scenario(
        UserScenarioCreate(scenario_name="A2", parameters={"v": 3}),
        user_id=user_a,
        db=db_session,
    )

    user_a_scenarios = list_user_scenarios(user_id=user_a, db=db_session)
    user_b_scenarios = list_user_scenarios(user_id=user_b, db=db_session)

    assert len(user_a_scenarios) == 2
    assert len(user_b_scenarios) == 1
    assert {s.scenario_name for s in user_a_scenarios} == {"A1", "A2"}


# ---------------------------------------------------------------------------
# Get by ID
# ---------------------------------------------------------------------------


def test_get_user_scenario_returns_correct_row(db_session):
    user_id = "user-get"
    created = create_user_scenario(
        UserScenarioCreate(
            scenario_name="High carbon", parameters={"carbon_price": 150}
        ),
        user_id=user_id,
        db=db_session,
    )

    fetched = get_user_scenario(scenario_id=created.id, db=db_session)

    assert fetched.id == created.id
    assert fetched.scenario_name == "High carbon"
    assert fetched.user_id == user_id
    assert fetched.parameters["carbon_price"] == 150


def test_get_user_scenario_raises_404_on_missing(db_session):
    with pytest.raises(HTTPException) as exc:
        get_user_scenario(scenario_id="does-not-exist", db=db_session)
    assert exc.value.status_code == 404
    assert exc.value.detail == "Scenario not found"


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


def test_update_user_scenario_merges_fields(db_session):
    created = create_user_scenario(
        UserScenarioCreate(
            scenario_name="Original",
            description="Original desc",
            parameters={"keep": "this", "replace": "me"},
        ),
        user_id="user-upd",
        db=db_session,
    )

    updated = update_user_scenario(
        scenario_id=created.id,
        scenario_data=UserScenarioUpdate(
            scenario_name="Updated",
            description="New desc",
            parameters={"replace": "done", "new": "added"},
        ),
        db=db_session,
    )

    assert updated.scenario_name == "Updated"
    assert updated.description == "New desc"
    assert updated.parameters == {"replace": "done", "new": "added"}


def test_update_user_scenario_unset_fields_unchanged(db_session):
    created = create_user_scenario(
        UserScenarioCreate(
            scenario_name="Original",
            description="Keep me",
            parameters={"a": 1, "b": 2},
        ),
        user_id="user-unset",
        db=db_session,
    )

    updated = update_user_scenario(
        scenario_id=created.id,
        scenario_data=UserScenarioUpdate(scenario_name="Renamed"),
        db=db_session,
    )

    assert updated.scenario_name == "Renamed"
    assert updated.description == "Keep me"
    assert updated.parameters == {"a": 1, "b": 2}


def test_update_user_scenario_raises_404_on_missing(db_session):
    with pytest.raises(HTTPException) as exc:
        update_user_scenario(
            scenario_id="no-such-id",
            scenario_data=UserScenarioUpdate(scenario_name="Nope"),
            db=db_session,
        )
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# Delete single
# ---------------------------------------------------------------------------


def test_delete_user_scenario_removes_it(db_session):
    created = create_user_scenario(
        UserScenarioCreate(scenario_name="Remove me", parameters={"x": 1}),
        user_id="user-del",
        db=db_session,
    )

    delete_user_scenario(scenario_id=created.id, db=db_session)

    with pytest.raises(HTTPException) as exc:
        get_user_scenario(scenario_id=created.id, db=db_session)
    assert exc.value.status_code == 404


def test_delete_user_scenario_raises_404_on_missing(db_session):
    with pytest.raises(HTTPException) as exc:
        delete_user_scenario(scenario_id="never-existed", db=db_session)
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# Delete all for user
# ---------------------------------------------------------------------------


def test_delete_all_user_scenarios_only_affects_given_user(db_session):
    user_a = "user-clean-a"
    user_b = "user-clean-b"

    for i in range(3):
        create_user_scenario(
            UserScenarioCreate(scenario_name=f"A-{i}", parameters={"n": i}),
            user_id=user_a,
            db=db_session,
        )
    for i in range(2):
        create_user_scenario(
            UserScenarioCreate(scenario_name=f"B-{i}", parameters={"n": i}),
            user_id=user_b,
            db=db_session,
        )

    delete_user_scenarios(user_id=user_a, db=db_session)

    assert list_user_scenarios(user_id=user_a, db=db_session) == []
    assert len(list_user_scenarios(user_id=user_b, db=db_session)) == 2


# ---------------------------------------------------------------------------
# Ordering
# ---------------------------------------------------------------------------


def test_list_user_scenarios_ordered_by_created_at_desc(db_session):
    user_id = "user-order"
    ids = []
    for name in ("first", "second", "third"):
        ids.append(
            create_user_scenario(
                UserScenarioCreate(scenario_name=name, parameters={"order": name}),
                user_id=user_id,
                db=db_session,
            ).id
        )
    # Manually bump created_at so ordering is deterministic
    scenarios = (
        db_session.query(UserScenario)
        .filter(UserScenario.user_id == user_id)
        .order_by(UserScenario.created_at.asc())
        .all()
    )
    for i, sc in enumerate(scenarios):
        sc.created_at = datetime(2026, 6, 3, 12, 0, i)
    db_session.commit()

    listed = list_user_scenarios(user_id=user_id, db=db_session)

    names = [s.scenario_name for s in listed]
    assert names == ["third", "second", "first"]
