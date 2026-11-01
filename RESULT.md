# Airline decision matrix — SAF buyer premium

## Changed files

- `apps/api/app/services/analysis/decision_matrix.py` — makes SAF purchase and
  offtake probabilities depend on the bounded buyer-premium pull; all other
  response and optional Lufthansa-parameter behavior is unchanged.
- `apps/api/app/services/analysis/dashboard_contracts.py` — supplies the EASA
  market-reference premium for HEFA when available, otherwise the production
  cost premium; carries its basis/period and guards the switch-window signal.
- `apps/api/app/schemas/analysis.py` and `apps/api/openapi.json` — add the SAF
  premium metadata and heuristic method contract.
- `apps/web/lib/product-read-model.ts` — passes premium metadata through as
  nullable values and treats a missing probability block as no decision model.
- `apps/web/components/airline-decision-matrix.tsx` — displays the Chinese
  buyer-premium/method disclosure.
- `apps/api/tests/test_decision_matrix_units.py`,
  `apps/api/tests/test_dashboard_contracts_units.py`,
  `apps/api/tests/test_realtime_aviation_updates.py`, and
  `apps/web/components/__tests__/airline-decision-matrix.test.tsx` — regression
  coverage and required-call-site updates.

## Test coverage added/updated

- The decision-matrix unit test verifies the SAF-pull curve at 0%, 15%, 30%,
  and above 30% premium, including the maturity/scarcity floor and unchanged
  non-SAF probabilities.
- The dashboard-contract unit tests verify HEFA uses the EASA market reference
  period, ATJ uses production cost, and an offtake-dominant HEFA scenario above
  15% does not emit `switch_window_opening`.
- The component test verifies the signed Chinese EASA buyer-premium disclosure
  and heuristic-scenario notice.

## Validation

1. `cd apps/api && /Users/yumei/fleet/jetscope-j365/apps/api/.venv/bin/python -m pytest -q -p no:cacheprovider; cd ../..`

   ```text
   628 passed, 14 warnings in 23.79s
   ```

2. `cd apps/web && npx vitest run --configLoader runner --fsModuleCachePath /private/tmp/jr-dm-vitest-cache; npm run typecheck; npm run lint:figure; cd ../..`

   ```text
   Test Files  48 passed (48)
        Tests  327 passed (327)
   ✓ Types generated successfully
   figure-contract-lint OK - 162 files scanned, 0 legacy violations remaining in 0 baselined files.
   ```

3. `npm test`

   ```text
   ℹ pass 261
   ℹ fail 0
   ℹ duration_ms 27810.334125
   ```

`npm run api:openapi` initially selected a system Python without FastAPI; rerunning
it with the required API virtualenv first in `PATH` regenerated `apps/api/openapi.json`.
The unmodified Vitest command cannot write `.vite-temp` or `.vitest-cache` through
this worktree's read-only shared `node_modules` symlink, so the passing run uses
only temporary cache/config-loader command-line overrides. No source, dependency,
or test configuration was changed to work around that environment boundary.
