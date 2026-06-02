import pytest
from pydantic import ValidationError

from app.schemas.preferences import PreferenceDocument, PreferenceUpdate
from app.schemas.state import RouteEditPayload


def test_preference_update_defaults_use_real_payload_models() -> None:
    update = PreferenceUpdate()

    assert update.preferences.schema_version == 1
    assert update.preferences.crudeSource == "manual"
    assert update.route_edits == {}


def test_preference_update_default_factories_are_not_shared_between_instances() -> None:
    first = PreferenceUpdate()
    second = PreferenceUpdate()

    first.route_edits["lhr-jfk"] = RouteEditPayload(baseCostUsdPerLiter=1.12)
    first.preferences.crudeUsdPerBarrel = 90.0

    assert "lhr-jfk" not in second.route_edits
    assert second.preferences.crudeUsdPerBarrel is None


def test_preference_document_parses_nested_payloads_and_coerces_numeric_strings() -> None:
    document = PreferenceDocument.model_validate(
        {
            "workspace_slug": "jet-team",
            "preferences": {
                "crudeSource": "brentEia",
                "crudeUsdPerBarrel": "85.5",
            },
            "route_edits": {
                "lhr-jfk": {
                    "baseCostUsdPerLiter": "1.25",
                    "co2SavingsKgPerLiter": "0.6",
                    "pathway": "HEFA",
                }
            },
        }
    )

    assert document.workspace_slug == "jet-team"
    assert document.preferences.crudeUsdPerBarrel == pytest.approx(85.5)
    assert isinstance(document.route_edits["lhr-jfk"], RouteEditPayload)
    assert document.route_edits["lhr-jfk"].baseCostUsdPerLiter == pytest.approx(1.25)


def test_preference_update_rejects_nan_numeric_fields() -> None:
    with pytest.raises(ValidationError) as exc_info:
        PreferenceUpdate.model_validate(
            {
                "preferences": {"crudeUsdPerBarrel": "nan"},
                "route_edits": {"lhr-jfk": {"baseCostUsdPerLiter": "nan"}},
            }
        )

    assert "finite numbers" in str(exc_info.value)
