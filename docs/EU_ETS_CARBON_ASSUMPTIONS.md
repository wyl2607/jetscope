# EU ETS Carbon Cost Assumptions

**Status:** Public-safe domain assumptions
**Last updated:** 2026-06-01
**Scope:** Assumptions used by JetScope analysis and market contract fields related to EU ETS/carbon cost inputs.

## Purpose

This note documents how JetScope currently interprets EU ETS-related carbon cost values in public product contracts.

It is a product-domain assumptions note, not regulatory, legal, accounting, or policy guidance.

## Contract Anchors

These assumptions map to existing contract fields and API inputs:

- [API_CONTRACT_V1.md](./API_CONTRACT_V1.md)
  - `GET /v1/market/snapshot` -> `values.eu_ets_price_eur_per_t`
  - `GET /v1/market/snapshot` -> `values.carbon_proxy_usd_per_t`
  - `GET /v1/analysis/tipping-point` -> `carbon_price_eur_per_t`
  - `GET /v1/analysis/airline-decision` -> `carbon_price_eur_per_t`
- [DATA_CONTRACT_V1.md](./DATA_CONTRACT_V1.md)
  - `eu_ets_price_eur_per_t` (`EUR/tCO2`)
  - `carbon_proxy_usd_per_t` (`USD/tCO2`)
  - `market_scope` values that may include `carbon_ets_settlement` and `derived_proxy`

## Assumptions

1. `eu_ets_price_eur_per_t` is treated as a market reference input, not as a definitive compliance settlement for any specific operator.
2. `carbon_proxy_usd_per_t` is treated as a derived proxy in USD that may be used when direct EU ETS values are unavailable or when a normalized USD-denominated signal is needed.
3. `carbon_price_eur_per_t` query inputs in analysis endpoints are scenario controls supplied by the caller; they are not validated as policy-correct or jurisdiction-complete values.
4. When carbon values are unavailable, analysis routes default optional carbon inputs to `0` per API contract rules.
5. Carbon-linked outputs are decision-support indicators and should be interpreted together with source confidence/fallback metadata.

## Interpretation Boundaries

- JetScope does not represent these fields as official regulatory calculations.
- JetScope does not assert external adoption, certification, or regulator endorsement.
- Contract documentation should describe implemented data behavior only.

## Source And Provenance Expectations

- EU ETS-related fields should be accompanied by source provenance where available (`source_details`, source status, confidence/fallback context).
- If a value is proxy-derived or fallback-based, that state should remain explicit in contract semantics.

## Change Control

Update this document when any of the following change:

- Field names, units, or endpoint parameters for carbon/EU ETS values.
- Source posture or fallback behavior affecting carbon interpretation.
- Confidence/fallback semantics that alter how carbon values should be consumed.
