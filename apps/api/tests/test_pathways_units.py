import pytest
from pydantic import ValidationError

from app.schemas.pathways import PathwaySummary, PathwayUpsert


def test_pathway_summary_requires_all_core_fields():
    with pytest.raises(ValidationError) as exc_info:
        PathwaySummary.model_validate(
            {
                "pathway_id": "ptw-1",
                "base_cost_usd_per_l": 0.85,
                "co2_savings_kg_per_l": 2.7,
            }
        )

    assert "name" in str(exc_info.value)


def test_pathway_upsert_applies_defaults_and_inherits_summary_fields():
    model = PathwayUpsert.model_validate(
        {
            "pathway_id": "ptw-hefa",
            "name": "HEFA",
            "base_cost_usd_per_l": 0.92,
            "co2_savings_kg_per_l": 2.4,
        }
    )

    assert model.pathway_id == "ptw-hefa"
    assert model.pathway == ""
    assert model.category == "saf"


def test_pathway_upsert_accepts_overrides_and_numeric_string_coercion():
    model = PathwayUpsert.model_validate(
        {
            "pathway_id": "ptw-atj",
            "name": "ATJ",
            "base_cost_usd_per_l": "1.15",
            "co2_savings_kg_per_l": "3.1",
            "pathway": "alcohol-to-jet",
            "category": "advanced",
        }
    )

    payload = model.model_dump()
    assert model.base_cost_usd_per_l == 1.15
    assert model.co2_savings_kg_per_l == 3.1
    assert payload["pathway"] == "alcohol-to-jet"
    assert payload["category"] == "advanced"

