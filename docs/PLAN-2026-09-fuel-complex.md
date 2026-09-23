# Fuel Complex & SAF market layer (2026-09)

Status: Phase A in progress. Owner: Claude (design/review), user (merge/deploy).

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
  the LCA reduction. EU ETS also reserves 20 M allowances covering 50/70/95 % of
  the SAF price gap (other / advanced / RFNBO); aviation free allocation ended 2026.
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
| A2 | SAF market layer: `data/curated/saf_market_prices.json` + loader; buyer cost for HEFA = market reference when one exists, production cost otherwise; `market_check` block on tipping-point; headline `signal` and engine events use buyer cost | this branch |
| A3 | Carbon: compliance value = zero-rating (2.5 kg/L × EUA) on one side only, everywhere; lifecycle reduction reported as `lifecycle_avoided_kg_per_l`, not money | this branch |
| A4 | Jet crack from same-date EIA spot table (Brent + Gulf jet); EU proxy uses the actual ratio when both are observed that day, fixed 1.20 only as fallback | next |

Done when: with the production inputs above, the tipping-point signal is not
`switch_window_opening`, the engine emits no HEFA CROSSOVER, the response
shows production cost, market reference (EASA 2025, dated) and the
compliance-adjusted gap separately, and API/web suites are green.

## Phase B — road fuels & macro

- German pump prices: EU Weekly Oil Bulletin (free, weekly, incl. taxes) for
  Euro-super 95 and diesel; Tankerkönig only if the user supplies an API key.
- Diesel–HVO100 spread (HVO curated from public station prices, dated).
- Inflation pass-through panel: Destatis motor-fuel CPI weight × fuel YoY
  (Aug 2026: +27.7 % YoY; weight to be verified from Destatis before use).
- EV vs diesel vs petrol cost per 100 km as a road-electrification reference.

## Phase C — supply side

- Feedstock crowding index (UCO / tallow references, HVO margin proxy).
- SAF-allowance support (50/70/95 %) as an explicit scenario toggle.
- Link pathway rows to esg-research-toolkit `techno_economics/saf.py` LCOS/IRR.
- Threshold alerts on Jet–SAF spread, Diesel–HVO spread, EUA.
