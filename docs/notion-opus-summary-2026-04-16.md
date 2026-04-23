# SAFvsOil — Notion / Opus 4.7 Handoff Summary

Generated: 2026-04-16T20:39:41
Project root: `/Users/yumei/SAFvsOil`

## What this project is
SAFvsOil is a local random-port research tool for comparing conventional jet fuel against multiple SAF pathways using live or semi-live market inputs and editable SAF baseline assumptions.

## Current product shape
- **Current prototype:** Node.js local app served by `server.mjs`
- **Frontend:** static HTML/CSS/JS in `public/`
- **Backend logic:** lightweight Node server + live source fetching in `server.mjs`
- **Persistence:** browser local state + optional server-local JSON in `server/local-persistence.mjs`
- **Product scaffold in parallel:** `apps/web` (Next.js), `apps/api` (FastAPI), `infra/docker-compose.yml`

## Main current homepage structure
1. `当前基准成本对比`
2. `盈亏平衡计算器`
3. `各路线盈亏平衡油价与竞争力`
4. Secondary sections: scenario management, sources, policy timeline, advanced details

## Live / semi-live data currently used
- Brent: FRED + EIA Daily Prices
- Jet fuel spot: FRED / EIA Gulf Coast jet fuel spot
- Carbon proxy: EC CBAM certificate price + ECB EUR/USD conversion
- ReFuelEU timeline: static policy baseline
- SAF route costs: research baseline + local editable overrides

## Key runtime commands
```bash
cd /Users/yumei/SAFvsOil
npm start
npm run check
node --test test/*.test.mjs
```

## Important files to review first
- `README.md`
- `PROJECT_PROGRESS.md`
- `docs/product-architecture.md`
- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `server.mjs`
- `server/local-persistence.mjs`
- `data/baselines.mjs`

## What changed recently
- Homepage restructured to be closer to screenshot-style decision surfaces.
- Primary UX now emphasizes current cost comparison, breakeven calculator, and route competitiveness.
- Slider-driven recalculation is wired into the same route math.
- DOM contract and homepage math tests were added.
- Test harness now isolates local-preferences persistence via temp files.

## Current strengths
- Live data pipeline already works.
- Core break-even math is already reusable.
- Tests are green.
- Prototype is usable now.

## Current weaknesses / likely Opus improvement targets
1. Visual polish can still move closer to a highly refined benchmark UI.
2. There is still duplicate “legacy vs new surface” rendering logic that could be simplified.
3. Browser-level screenshot or end-to-end visual QA is still missing.
4. Phase B scaffold exists but is not yet the production surface.
5. Internationalization / bilingual copy in the prototype is present but could be normalized.

## Suggested asks for Opus 4.7
You can give Opus this brief:
- Improve the homepage UI/UX of SAFvsOil while preserving the current calculations and test behavior.
- Focus on the three primary sections only:
  1. current cost comparison
  2. breakeven calculator
  3. route competitiveness list
- Reduce duplication between legacy and new views.
- Suggest stronger component boundaries and naming.
- Preserve current live source behavior and persistence semantics.
- Recommend a migration path from the Node prototype to the Next.js/FastAPI scaffold without breaking the current product.
- Suggest missing tests, especially browser/e2e/visual checks.

## Files prepared for handoff
- Summary: `/Users/yumei/SAFvsOil/docs/notion-opus-summary-2026-04-16.md`
- Code bundle: `/Users/yumei/SAFvsOil/docs/notion-opus-code-bundle-2026-04-16.md`
- Manifest: `/Users/yumei/SAFvsOil/docs/notion-opus-manifest-2026-04-16.txt`
- Archive: `/Users/yumei/SAFvsOil/SAFvsOil-notion-handoff-2026-04-16.tar.gz`

## Notes for Notion / Opus
If Notion handles markdown better than archives, upload:
1. this summary file
2. the code bundle markdown
3. optionally the tar.gz archive for full-project context
