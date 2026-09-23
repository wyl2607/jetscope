# Design: linking JetScope pathways to esg-research-toolkit SAF economics (Phase C4)

Status: proposal for review, 2026-09-23. No code yet. Owner: Claude (design),
user (decision, merge, deploy).

## Goal

A reader looking at a SAF pathway row in JetScope (HEFA / ATJ / FT / PtL) can
see project economics for that pathway: levelized cost (LCOS), NPV, IRR and
payback. The model already exists in esg-research-toolkit, so JetScope links to
it and doesn't re-implement it (constraint in
`docs/PLAN-2026-09-fuel-complex.md`).

## What exists (checked 2026-09-23)

- esg-research-toolkit `origin/main` (fee30f7): `techno_economics/saf.py`
  computes LCOS, NPV, IRR and payback from `SAFInput`.
- Public JSON API, live at `https://esg.meichen.beauty/api/techno/`:
  - `POST /saf` takes `SAFInput` and returns `SAFCostResult`
  - `GET /saf-benchmarks` returns six presets: HEFA_EU, ATJ_Brazil,
    ATJ_US_IRA, FT_biomass_DE, PtL_EU_2025, PtL_EU_2035_projected
- UI at `https://esg.meichen.beauty/saf`. Presets load by button click; the
  page does **not** read URL parameters.

## Problem found: the esg presets are not fit to show in JetScope yet

The presets have no dated sources (the comments cite IATA, ICAO and BNEF with
no dates), and several of them are far below current public data:

| esg preset | esg LCOS (EUR/t) | Dated reference | Main gap |
|---|---|---|---|
| HEFA_EU | 1,183 | EASA 2025 production cost 1,630; market 1,925 | UCO input is EUR 600/t. Fastmarkets: 2025 range 1,070–1,207.50, week ending 2026-09-10 1,280–1,290. **With UCO at 1,285, LCOS is 2,040.** |
| ATJ_Brazil | 899 | EASA advanced biofuels 2,760 [1,790–3,130] | Sugarcane ethanol isn't RED Annex IX Part A, so the reference only partly applies. The ratio of 2.1 matches EASA (60 % conversion × 83 % selectivity ≈ 2.0). |
| FT_biomass_DE | 1,315 | EASA advanced biofuels 2,760 [1,790–3,130] | Feedstock-to-SAF ratio is 4.5. EASA's FT (biomass) figures (20 % × 70 %) imply about 7.1. |
| PtL_EU_2025 | 6,115 | EASA synthetic 7,520 [6,710–9,525] | Same order of magnitude. EASA uses 5.89 t CO2 + 0.79 t H2 per t fuel; esg lumps both into one "feedstock". |

LCOS values come from live `POST /api/techno/saf` calls with the presets
unchanged. If JetScope showed these numbers, HEFA would look about 40 % cheaper
to produce than the EU market price, with no source attached. That breaks the
contract from #374: every figure carries a source, basis and date.

## Options

| | What | Coupling | Data honesty | Effort |
|---|---|---|---|---|
| A. Link-out | Each JetScope pathway row links to esg `/saf?preset=…` with JetScope's live jet price filled in | None at runtime; needs URL prefill in esg | Numbers live in esg and carry esg's sourcing | Small, both repos |
| B. Server-side call | JetScope API calls `POST /api/techno/saf` per pathway and shows LCOS/IRR inline | JetScope availability depends on esg; needs timeout, cache and a fallback label | Only acceptable after the esg presets are dated and recalibrated | Medium |
| C. Vendor the model | Copy `saf.py` into JetScope | Two copies drift | Duplicate truth | Rejected by the plan constraint |

## Recommendation

1. **esg first** (separate PR in esg-research-toolkit):
   - Recalibrate presets against dated sources: UCO from the curated
     Fastmarkets figures; ATJ/FT conversion and selectivity from EASA's
     methodology document, Table 7.
   - Add `source` / `as_of` to each preset, and fix the FT ratio.
   - Add URL prefill to `/saf`: `?preset=HEFA_EU&jet_fuel_price_eur_per_litre=…`.
   - Keep the change inside `techno_economics/` and `SafPage.tsx`.
2. **Then JetScope, option A**: in the pathway comparison table, a
   "Project economics (esg)" link per row, mapping HEFA → HEFA_EU,
   ATJ → ATJ_Brazil, FT → FT_biomass_DE, PtL → PtL_EU_2025. The link carries
   the current EU jet proxy in EUR/L. Mark it as an external model with its
   own assumptions.
3. **Option B only later**, if inline numbers are still wanted after 1 and 2 are
   live, and only when the presets carry sources.

Policy credits need care. The EU ETS zero-rating and SAF allowances (C1) are
worth money to the airline that burns the fuel, not to the producer, so they
don't belong in the producer's `policy_credit_eur_per_tonne`. JetScope
shouldn't pass them into esg's NPV. Only producer-side support would
(e.g. ATJ_US_IRA's 45Z credit).

## Open decisions for the user

1. Do the esg recalibration first (recommended) or accept today's presets with a warning?
2. Option A (link-out) is enough for now, or do you want B (inline numbers)?
3. The esg working copy at `~/projects/esg-research-toolkit` is on
   `fix/unknown-not-zero` with an uncommitted `core/models.py` change. Is
   another session using it? The esg work would go in its own worktree off
   `origin/main` either way.
