"""User scenarios CRUD endpoints for SQLite persistence."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.sqlite import get_sqlite_db
from app.models.sqlite_models import UserScenario
from app.schemas.sqlite_schemas import (
    UserScenarioCreate,
    UserScenarioRead,
    UserScenarioUpdate,
)

router = APIRouter(prefix="/sqlite/user-scenarios", tags=["user-scenarios-sqlite"])


@router.get("", response_model=list[UserScenarioRead])
def list_user_scenarios(
    user_id: str = Query(..., description="User ID to filter scenarios"),
    db: Session = Depends(get_sqlite_db),
):
    """List all scenarios for a user."""
    scenarios = (
        db.query(UserScenario)
        .filter(UserScenario.user_id == user_id)
        .order_by(UserScenario.created_at.desc())
        .all()
    )
    return scenarios


@router.get("/{scenario_id}", response_model=UserScenarioRead)
def get_user_scenario(scenario_id: str, db: Session = Depends(get_sqlite_db)):
    """Get specific user scenario by ID."""
    scenario = db.query(UserScenario).filter(UserScenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@router.post("", response_model=UserScenarioRead, status_code=201)
def create_user_scenario(
    scenario_data: UserScenarioCreate,
    user_id: str = Query(..., description="User ID"),
    db: Session = Depends(get_sqlite_db),
):
    """Create new user scenario."""
    scenario = UserScenario(
        user_id=user_id,
        **scenario_data.model_dump(),
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.put("/{scenario_id}", response_model=UserScenarioRead)
def update_user_scenario(
    scenario_id: str,
    scenario_data: UserScenarioUpdate,
    db: Session = Depends(get_sqlite_db),
):
    """Update user scenario."""
    scenario = db.query(UserScenario).filter(UserScenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    update_data = scenario_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(scenario, key, value)

    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.delete("/{scenario_id}", status_code=204)
def delete_user_scenario(scenario_id: str, db: Session = Depends(get_sqlite_db)):
    """Delete user scenario."""
    scenario = db.query(UserScenario).filter(UserScenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    db.delete(scenario)
    db.commit()


@router.delete("", status_code=204)
def delete_user_scenarios(
    user_id: str = Query(..., description="User ID"),
    db: Session = Depends(get_sqlite_db),
):
    """Delete all scenarios for a user."""
    db.query(UserScenario).filter(UserScenario.user_id == user_id).delete()
    db.commit()
