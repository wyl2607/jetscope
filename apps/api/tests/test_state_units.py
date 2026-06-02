import pytest
from pydantic import ValidationError

from app.schemas.state import PreferencesPayload, RouteEditPayload


def test_preferences_defaults_and_extra_fields_are_preserved():
    payload = PreferencesPayload(customPreference="enabled")

    assert payload.schema_version == 1
    assert payload.crudeSource == "manual"
    assert payload.benchmarkMode == "crude-proxy"
    assert payload.model_dump()["customPreference"] == "enabled"


def test_preferences_numeric_fields_are_coerced_to_float():
    payload = PreferencesPayload(
        crudeUsdPerBarrel="84.5",
        carbonPriceUsdPerTonne=70,
        subsidyUsdPerLiter=None,
        jetProxySlope="1.25",
        jetProxyIntercept=0,
    )

    assert payload.crudeUsdPerBarrel == 84.5
    assert payload.carbonPriceUsdPerTonne == 70.0
    assert payload.subsidyUsdPerLiter is None
    assert payload.jetProxySlope == 1.25
    assert payload.jetProxyIntercept == 0.0


@pytest.mark.parametrize(
    "field_name",
    [
        "crudeUsdPerBarrel",
        "carbonPriceUsdPerTonne",
        "subsidyUsdPerLiter",
        "jetProxySlope",
        "jetProxyIntercept",
    ],
)
def test_preferences_reject_nan_values(field_name: str):
    with pytest.raises(ValidationError) as exc:
        PreferencesPayload(**{field_name: "nan"})

    assert "numeric fields must be finite numbers" in str(exc.value)


def test_route_edit_coerces_numeric_fields_and_allows_extra():
    payload = RouteEditPayload(
        baseCostUsdPerLiter="2.75",
        co2SavingsKgPerLiter="3.5",
        pathway="HEFA",
        extraMeta="test",
    )

    assert payload.baseCostUsdPerLiter == 2.75
    assert payload.co2SavingsKgPerLiter == 3.5
    assert payload.pathway == "HEFA"
    assert payload.model_dump()["extraMeta"] == "test"


@pytest.mark.parametrize("field_name", ["baseCostUsdPerLiter", "co2SavingsKgPerLiter"])
def test_route_edit_rejects_nan_values(field_name: str):
    with pytest.raises(ValidationError) as exc:
        RouteEditPayload(**{field_name: float("nan")})

    assert "route edit numeric fields must be finite numbers" in str(exc.value)

