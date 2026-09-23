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
        assert cost == pytest.approx(PATHWAY_COSTS["hefa"].midpoint_usd_per_l - 0.50, rel=1e-12)

    def test_blend_rate_scales_support(self):
        cost = effective_saf_cost("hefa", subsidy_usd_per_l=0.50, blend_rate_pct=50.0)
        assert cost == pytest.approx(PATHWAY_COSTS["hefa"].midpoint_usd_per_l - 0.50 * 0.50, rel=1e-12)

    def test_carbon_price_reduces_cost(self):
        cost = effective_saf_cost("atj", carbon_price_eur_per_t=100.0)
        credit = 100.0 * EUR_TO_USD * (2.5 / 1000.0)
        assert cost == pytest.approx(PATHWAY_COSTS["atj"].midpoint_usd_per_l - credit, rel=1e-12)

    def test_unknown_pathway_raises_key_error(self):
        with pytest.raises(KeyError):
            effective_saf_cost("bogus")


class TestEasaReferenceBands:
    def test_bands_are_easa_2025_reference_prices_converted_per_litre(self):
        # EUR/t / 1250 L/t x 1.1435 USD/EUR (EASA 2026 briefing note, Table 1).
        def usd_per_l(eur_per_t: float) -> float:
            return round(eur_per_t / 1250 * 1.1435, 4)

        ptl = PATHWAY_COSTS["ptl"]
        assert (ptl.min_usd_per_l, ptl.midpoint_usd_per_l, ptl.max_usd_per_l) == (
            usd_per_l(6710), usd_per_l(7520), usd_per_l(9525),
        )
        # EASA does not split advanced aviation biofuels by technology.
        for key in ("atj", "ft"):
            band = PATHWAY_COSTS[key]
            assert (band.min_usd_per_l, band.midpoint_usd_per_l, band.max_usd_per_l) == (
                usd_per_l(1790), usd_per_l(2760), usd_per_l(3130),
            )
        # HEFA: one production-cost point; its buyer price is the market index.
        hefa = PATHWAY_COSTS["hefa"]
        assert hefa.min_usd_per_l == hefa.midpoint_usd_per_l == hefa.max_usd_per_l == usd_per_l(1630)
