import pytest

from app.services.analysis.pathway_costs import (
    EUR_TO_USD,
    FOSSIL_JET_EMISSIONS_KG_PER_L,
    PATHWAY_COSTS,
    carbon_credit_usd_per_l,
    effective_saf_cost,
    get_pathway_cost,
    list_pathway_costs,
)


class TestListPathwayCosts:
    def test_returns_all_five_pathways(self):
        bands = list_pathway_costs()
        keys = {b.pathway_key for b in bands}
        assert len(bands) == 5
        assert keys == {"hefa", "atj", "ft", "ptl", "fossil_jet_crisis"}

    def test_preserves_dict_insertion_order(self):
        bands = list_pathway_costs()
        keys = [b.pathway_key for b in bands]
        assert keys == list(PATHWAY_COSTS.keys())


class TestGetPathwayCost:
    def test_known_key_lowercase(self):
        band = get_pathway_cost("hefa")
        assert band.name == "HEFA"

    def test_normalizes_whitespace_and_case(self):
        band = get_pathway_cost("  ATJ  ")
        assert band.name == "ATJ"

    def test_unknown_key_raises_expected_string(self):
        with pytest.raises(KeyError) as exc:
            get_pathway_cost("nope")
        assert "nope" in str(exc.value)

    def test_all_pathways_from_dict_are_retrievable(self):
        for key in PATHWAY_COSTS:
            band = get_pathway_cost(key)
            assert band.pathway_key == key


class TestCarbonCreditUsdPerL:
    def test_zero_carbon_price_returns_zero(self):
        assert carbon_credit_usd_per_l(0.0) == 0.0

    def test_is_full_combustion_factor_not_lifecycle_share(self):
        # EU ETS zero-rates eligible SAF: the allowance saved is the full 2.5 kg/L,
        # whatever the pathway's LCA reduction.
        credit = carbon_credit_usd_per_l(95.0)
        assert credit == pytest.approx(95.0 * EUR_TO_USD * (2.5 / 1000.0), rel=1e-12)


class TestEffectiveSafCost:
    def test_returns_midpoint_when_no_support(self):
        cost = effective_saf_cost("hefa")
        assert cost == PATHWAY_COSTS["hefa"].midpoint_usd_per_l

    def test_subsidy_reduces_cost(self):
        cost = effective_saf_cost("hefa", subsidy_usd_per_l=0.50)
        assert cost == pytest.approx(1.25 - 0.50, rel=1e-12)

    def test_blend_rate_scales_support(self):
        cost = effective_saf_cost("hefa", subsidy_usd_per_l=0.50, blend_rate_pct=50.0)
        assert cost == pytest.approx(1.25 - 0.50 * 0.50, rel=1e-12)

    def test_carbon_price_reduces_cost(self):
        cost = effective_saf_cost("atj", carbon_price_eur_per_t=100.0)
        credit = 100.0 * EUR_TO_USD * (2.5 / 1000.0)
        assert cost == pytest.approx(1.5 - credit, rel=1e-12)

    def test_unknown_pathway_raises_key_error(self):
        with pytest.raises(KeyError):
            effective_saf_cost("bogus")
