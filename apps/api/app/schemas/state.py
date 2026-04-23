from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PreferencesPayload(BaseModel):
    schema_version: int = 1
    crudeSource: Literal["manual", "brentEia", "brentFred"] = "manual"
    carbonSource: Literal["manual", "cbamCarbonProxyUsd"] = "manual"
    benchmarkMode: Literal["crude-proxy", "live-jet-spot"] = "crude-proxy"
    crudeUsdPerBarrel: float | None = None
    carbonPriceUsdPerTonne: float | None = None
    subsidyUsdPerLiter: float | None = None
    jetProxySlope: float | None = None
    jetProxyIntercept: float | None = None

    model_config = ConfigDict(extra="allow")

    @field_validator(
        "crudeUsdPerBarrel",
        "carbonPriceUsdPerTonne",
        "subsidyUsdPerLiter",
        "jetProxySlope",
        "jetProxyIntercept",
        mode="before",
    )
    @classmethod
    def validate_numeric_field(cls, value: object) -> object:
        if value is None:
            return value
        numeric = float(value)
        if numeric != numeric:  # NaN
            raise ValueError("numeric fields must be finite numbers")
        return numeric


class RouteEditPayload(BaseModel):
    baseCostUsdPerLiter: float | None = None
    co2SavingsKgPerLiter: float | None = None
    pathway: str | None = None
    name: str | None = None

    model_config = ConfigDict(extra="allow")

    @field_validator("baseCostUsdPerLiter", "co2SavingsKgPerLiter", mode="before")
    @classmethod
    def validate_route_numeric_field(cls, value: object) -> object:
        if value is None:
            return value
        numeric = float(value)
        if numeric != numeric:  # NaN
            raise ValueError("route edit numeric fields must be finite numbers")
        return numeric
