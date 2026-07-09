import pytest
from pydantic import ValidationError

from app.schemas.scenarios import SCENARIO_NAME_MAX_LENGTH, ScenarioCreate


def test_scenario_create_strips_name_before_persistence() -> None:
    payload = ScenarioCreate.model_validate({"name": "  EU disruption drill  "})

    assert payload.name == "EU disruption drill"


def test_scenario_create_rejects_blank_name() -> None:
    with pytest.raises(ValidationError) as exc_info:
        ScenarioCreate.model_validate({"name": "   "})

    assert "Scenario name must be a non-empty string" in str(exc_info.value)


def test_scenario_create_rejects_overlong_name_after_trimming() -> None:
    with pytest.raises(ValidationError) as exc_info:
        ScenarioCreate.model_validate({"name": f" {'A' * (SCENARIO_NAME_MAX_LENGTH + 1)} "})

    assert "String should have at most 120 characters" in str(exc_info.value)
