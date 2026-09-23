# Fuel Complex & SAF market layer (2026-09)

Status: Phase A, B1/B3/B4 live (d262a3a); C1 (SAF allowance toggle) in review. Owner: Claude (design/review), user (merge/deploy).

## Goal

JetScope answers "is switching to SAF / investing in sustainable fuel getting
viable at today's prices?" without false signals: fossil side live, SAF side
split into what it costs to make, what it costs to buy, and what compliance
changes, with every number dated and sourced.

## Context (verified 2026-09-23)

- Fossil side is live since #375: Brent (EIA, 116.15 @ 09-21), US Gulf jet
  (EIA, 1.243 USD/L @ 09-15). IATA global jet average 194.90 USD/bbl ≈ 1.23 USD/L
  agrees. German retail diesel 2.43 EUR/L (Destatis, 09-14), 2.471 (ADAC, 09-17).
- SAF side is static: `pathway_costs.py` midpoints (HEFA 1.25, ATJ 1.5, FT 1.9,
  PtL 4.0 USD/L), `manual`, updated 2026-07-15. They are production-cost guesses,
  not purchase prices.
- Live consequence: `/v1/analysis/tipping-point` with live inputs returns
  `signal=switch_window_opening`, HEFA `inflection`. `TippingPointEngine` will
  emit a persistent HEFA **CROSSOVER** once jet observations newer than the
  legacy fetch-time rows arrive (live jet 1.243 vs HEFA 1.25 − credit ≈ 1.08).
- Market reference (EASA ReFuelEU Annual Technical Report 2026, published
  2026-09-17): 2025 average SAF price 1,925 EUR/t, conventional jet 640 EUR/t;
  SAF share 2.79 %, 1.1 Mt; ~80 % aviation biofuel, overwhelmingly UCO-HEFA;
  85 % of feedstock imported, 61 % of imports from China.
- Carbon: two inconsistent treatments today. The tipping-point route adds full
  ETS cost to fossil (2.5 kg/L × EUA); the engine / pathway compare subtract a
  *lifecycle* credit (reduction % × 2.5 kg/L × EUA). Under the EU ETS, eligible
  SAF is zero-rated, so the compliance value is the full combustion factor, not
  the LCA reduction. EU ETS also reserves 20 M allowances (2024–2030) covering
  50/70/95/100 % of the SAF price gap left after the carbon price (other /
  advanced biofuel or renewable H2 / RFNBO / remote airports; Art. 3c(6));
  aviation free allocation ended 2026.
- NOT a market price: BNEF's 2,746 USD/t is a 2027-Q1 outlook. Kept out of
  comparisons.

## Constraints

- Contract from #374 holds: no seed/placeholder value is ever published as a
  quote; every figure carries source, basis and date.
- Curated inputs live in `data/curated/` (shipped in the API image), not code.
- No paid feeds. Where only paywalled data exists (UCO, HVO wholesale, SAF
  assessments), curate public dated references and say so.
- Reuse `crossover.py` bands; do not add a parallel scoring system.
- Project economics (CAPEX/IRR/LCOS) stay in esg-research-toolkit; JetScope
  links to it rather than re-implementing.

## Phase A — honest SAF signal (this sprint)

| # | Change | PR |
|---|---|---|
| A0 | snapshot `generated_at` = latest refresh; UTC timestamps | #376 |
| A1 | history never publishes seed/missing rows as latest | #377 |
| A2 | SAF market layer: `data/curated/market/saf_market_prices.json` + loader; buyer cost for HEFA = market reference when one exists, production cost otherwise; `market_check` block on tipping-point; headline `signal` and engine events use buyer cost | #378 |
| A3 | Carbon: compliance value = zero-rating (2.5 kg/L × EUA) everywhere; `carbon_reduction_pct` stays an LCA figure with no money attached | #378 |
| A4 | Jet crack from same-date EIA spot table (Brent + Gulf jet); EU proxy uses the actual ratio when both are observed that day, fixed 1.20 only as fallback (ratio used while ≤ 21 days old; 2026-09-23: 1.51, EU proxy 0.867 → 1.092 USD/L) | this branch |

Done when: with the production inputs above, the tipping-point signal is not
`switch_window_opening`, the engine emits no HEFA CROSSOVER, the response
shows production cost, market reference (EASA 2025, dated) and the
compliance-adjusted gap separately, and API/web suites are green.

## Phase B — road fuels & macro

- B1 (live): German pump prices from the EU Weekly Oil Bulletin
  **history workbook** (Germany, Euro-super 95 and diesel, with and without
  taxes, weekly), fetched once a day, served at `/v1/road-fuels/germany`.
  On 2026-09-23 the Bulletin's "latest prices with taxes" download served the
  same ex-tax file as "without taxes" (Germany E95 1,170 EUR/1000 L), so only
  the history workbook is used. Week of 2026-09-21: E95 2.348, diesel 2.457
  EUR/L incl. tax (52-week change +36.9 % / +55.1 %).
- B3 (live): CPI pass-through from Destatis (Aug 2026, published
  2026-09-10): CPI +2.9 %, motor fuels +27.7 % at a weight of 30.46 per mille,
  so a static direct contribution of about 0.84 pp; CPI excluding heating oil
  and motor fuels +2.0 %. Curated in `data/curated/market/destatis_cpi.json`.
- B2 (next): Diesel–HVO100 spread, only once a dated public HVO source is
  verified; a single station page is not a national price.
- B4 (live): EV vs diesel vs petrol cost per 100 km. Household power
  from BDEW-Strompreisanalyse 08/2026 (37.0 ct/kWh, 2026 Jan–Aug new-customer
  tariffs, 3,500 kWh/a, incl. VAT), with Destatis 2025-H2 (40.55 ct/kWh, all
  households) shown as a reference. Curated in
  `data/curated/market/household_electricity_prices.json`. Home charging only:
  no verifiable public fast-charging price source. Consumptions default to
  6 L / 7 L / 18 kWh per 100 km, labelled assumptions, adjustable via
  `?diesel_l=&petrol_l=&ev_kwh=`.

## Phase C — supply side

- Feedstock crowding index (UCO / tallow references, HVO margin proxy).
- C1 (this branch): EU ETS SAF-allowance toggle on `/v1/analysis/tipping-point`
  (`saf_allowance=none|statutory|remote_airport`, default `none`). Rates from
  the OJ text of Directive (EU) 2023/958, Art. 3c(6): 50 % other, 70 % advanced
  biofuels (RED Annex IX Part A) / renewable H2, 95 % RFNBO, 100 % small-island,
  small and outermost-region airports, all on the gap left after the carbon
  price. Pathway mapping HEFA 50 (UCO/tallow are Annex IX Part B), ATJ 50 and
  FT 70 (feedstock assumptions), PtL 95. Paid yearly ex post, capped at 20 M
  allowances and cut uniformly when oversubscribed, so it stays off the headline;
  `market_check` always carries the statutory what-if (2026-09-23: HEFA premium
  +36 % → +18 %, still above the 15 % inflection band). Latest allocation: 2025
  use, 5.2 M allowances ≈ EUR 430 M, 530 kt SAF (Commission, 2026-09-15).
  Curated in `data/curated/market/eu_ets_saf_allowances.json`. COM(2026) 616
  (2026-07-27) proposes extending to 2040 with 110 M more allowances; not law.
- Link pathway rows to esg-research-toolkit `techno_economics/saf.py` LCOS/IRR.
- Threshold alerts on Jet–SAF spread, Diesel–HVO spread, EUA.
