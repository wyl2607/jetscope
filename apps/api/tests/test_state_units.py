from __future__ import annotations

from math import nan

import pytest
from pydantic import ValidationError

from app.schemas.state import PreferencesPayload, RouteEditPayload


class TestPreferencesPayload:
    def test_defaults_and_valid_construction(self):
        p = PreferencesPayload()
        assert p.schema_version == 1
        assert p.crudeSource == "manual"
        assert p.carbonSource == "manual"
        assert p.benchmarkMode == "crude-proxy"
        assert p.crudeUsdPerBarrel is None
        assert p.carbonPriceUsdPerTonne is None

    def test_accepts_explicit_numeric_values(self):
        p = PreferencesPayload(
            crudeUsdPerBarrel=75.5,
            carbonPriceUsdPerTonne=120.0,
            subsidyUsdPerLiter=0.3,
        )
        assert p.crudeUsdPerBarrel == 75.5
        assert p.carbonPriceUsdPerTonne == 120.0
        assert p.subsidyUsdPerLiter == 0.3

    def test_rejects_nan_for_numeric_fields(self):
        with pytest.raises(ValidationError, match="must be finite numbers"):
            PreferencesPayload(crudeUsdPerBarrel=nan)
        with pytest.raises(ValidationError, match="must be finite numbers"):
            PreferencesPayload(carbonPriceUsdPerTonne=nan)
        with pytest.raises(ValidationError, match="must be finite numbers"):
            PreferencesPayload(subsidyUsdPerLiter=nan)

    def test_rejects_nan_for_proxy_fields(self):
        with pytest.raises(ValidationError, match="must be finite numbers"):
            PreferencesPayload(jetProxySlope=nan)
        with pytest.raises(ValidationError, match="must be finite numbers"):
            PreferencesPayload(jetProxyIntercept=nan)

    def test_allows_extra_fields(self):
        p = PreferencesPayload(unknown_key="ignored")
        assert p.model_extra == {"unknown_key": "ignored"}

    def test_accepts_string_numeric(self):
        p = PreferencesPayload(crudeUsdPerBarrel="80.0")
        assert p.crudeUsdPerBarrel == 80.0

    def test_rejects_invalid_literal(self):
        with pytest.raises(ValidationError):
            PreferencesPayload(crudeSource="invalid_source")


class TestRouteEditPayload:
    def test_defaults_and_valid_construction(self):
        r = RouteEditPayload()
        assert r.baseCostUsdPerLiter is None
        assert r.co2SavingsKgPerLiter is None
        assert r.pathway is None
        assert r.name is None

    def test_accepts_explicit_values(self):
        r = RouteEditPayload(
            baseCostUsdPerLiter=2.5,
            co2SavingsKgPerLiter=0.8,
            pathway="marine",
            name="Route A",
        )
        assert r.baseCostUsdPerLiter == 2.5
        assert r.co2SavingsKgPerLiter == 0.8
        assert r.pathway == "marine"
        assert r.name == "Route A"

    def test_rejects_nan_for_route_numeric_fields(self):
        with pytest.raises(ValidationError, match="route edit numeric fields must be finite numbers"):
            RouteEditPayload(baseCostUsdPerLiter=nan)
        with pytest.raises(ValidationError, match="route edit numeric fields must be finite numbers"):
            RouteEditPayload(co2SavingsKgPerLiter=nan)

    def test_allows_extra_fields(self):
        r = RouteEditPayload(extra_field="allowed")
        assert r.model_extra == {"extra_field": "allowed"}

    def test_accepts_string_numeric(self):
        r = RouteEditPayload(baseCostUsdPerLiter="3.14")
        assert r.baseCostUsdPerLiter == 3.14
