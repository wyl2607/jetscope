from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module
from types import ModuleType
import sys

import pytest


@dataclass
class _PathwayCostBandFake:
    pathway_key: str
    name: str
    min_usd_per_l: float
    max_usd_per_l: float
    midpoint_usd_per_l: float
    carbon_reduction_pct: float
    maturity_level: str


_analysis_module = ModuleType("app.schemas.analysis")
_analysis_module.PathwayCostBand = _PathwayCostBandFake
sys.modules["app.schemas.analysis"] = _analysis_module

pathway_costs = import_module("app.services.analysis.pathway_costs")


def test_list_pathway_costs_exposes_defined_catalog() -> None:
    costs = pathway_costs.list_pathway_costs()

    assert len(costs) == len(pathway_costs.PATHWAY_COSTS)
    assert {item.pathway_key for item in costs} == set(pathway_costs.PATHWAY_COSTS.keys())
    assert pathway_costs.DEFAULT_ANALYSIS_PATHWAY_KEY in {item.pathway_key for item in costs}


def test_get_pathway_cost_normalizes_key_and_returns_real_band() -> None:
    hefa = pathway_costs.get_pathway_cost("  HEFA\n")

    assert hefa.pathway_key == "hefa"
    assert hefa.name == "HEFA"
    assert hefa.midpoint_usd_per_l == pytest.approx(1.25)


def test_get_pathway_cost_raises_keyerror_for_unknown_pathway() -> None:
    raw_key = " Unknown-Pathway "

    with pytest.raises(KeyError) as exc_info:
        pathway_costs.get_pathway_cost(raw_key)

    assert exc_info.value.args[0] == raw_key


def test_carbon_credit_usd_per_l_uses_conversion_and_avoided_emissions_formula() -> None:
    carbon_price_eur_per_t = 100.0
    reduction_pct = 80.0

    credit = pathway_costs.carbon_credit_usd_per_l(carbon_price_eur_per_t, reduction_pct)
    expected = (
        carbon_price_eur_per_t
        * pathway_costs.EUR_TO_USD
        * (pathway_costs.FOSSIL_JET_EMISSIONS_KG_PER_L / 1000.0)
        * (reduction_pct / 100.0)
    )

    assert credit == pytest.approx(expected)


def test_effective_saf_cost_applies_subsidy_and_carbon_credit_scaled_by_blend_rate() -> None:
    blend_rate_pct = 50.0
    subsidy_usd_per_l = 0.20
    carbon_price_eur_per_t = 120.0

    result = pathway_costs.effective_saf_cost(
        "atj",
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        subsidy_usd_per_l=subsidy_usd_per_l,
        blend_rate_pct=blend_rate_pct,
    )
    atj = pathway_costs.get_pathway_cost("atj")
    expected = atj.midpoint_usd_per_l - (
        subsidy_usd_per_l
        + pathway_costs.carbon_credit_usd_per_l(carbon_price_eur_per_t, atj.carbon_reduction_pct)
    ) * (blend_rate_pct / 100.0)

    assert result == pytest.approx(expected)
