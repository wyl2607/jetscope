# JetScope Web Chinese Localization Plan

Approval State: verified

## Goal

Make the JetScope public web experience Chinese-first on the root site while preserving the existing German entry points and avoiding release, deploy, sync, secret, or API behavior changes.

## Context

- Repository: `/Users/yumei/projects/jetscope`
- Remote: `https://github.com/wyl2607/jetscope.git`
- Branch at plan time: `main`
- The repository already has `apps/web/src/locales/en.json`, `de.json`, and `zh.json`, but primary UI text is still hardcoded across `apps/web/app/*` and `apps/web/components/*`.
- Root layout already declares `html lang="zh-CN"` and OpenGraph locale `zh_CN`, so the first implementation phase should align visible UI and metadata with that default.
- Current worktree is dirty before this plan. Existing modified and untracked product/test files must be treated as user/pre-existing work; implementation must read and work with them, not revert them.

## Scope

Allowed:

- `apps/web/app/**/*.tsx`
- `apps/web/components/**/*.tsx`
- `apps/web/lib/**/*.ts`
- `apps/web/src/locales/*.json`
- focused tests under `test/**/*.mjs` only when needed for changed read-model or routing behavior
- this plan file and project progress/trace notes if needed for handoff

Forbidden:

- `.env*`, secrets, private runtime data, logs, `.automation/`, `.omx/`
- release, deploy, sync, SSH, VPS, cron, service, LaunchAgent, or node-sync surfaces
- `scripts/release.sh`, `scripts/sync-to-nodes.sh`, `scripts/publish-to-github.sh`, `scripts/sync-excludes.sh`
- API behavior changes under `apps/api`
- destructive git operations: reset, clean, checkout revert, rebase, force push
- commit, push, PR, deploy, or node sync without a separate explicit approval

## Decision

Use a Chinese-first direct UI pass instead of introducing a new i18n framework in this slice. Existing locale JSON can be expanded for shared short labels, but long editorial pages may keep local Chinese copy in TSX. This reduces dependency and routing risk while making the product visibly Chinese quickly.

## Implementation Order

1. Snapshot and classify dirty tree before editing.
2. Agent A: localize shell, navigation, home page, metadata, and top-level route cards.
3. Agent B: localize dashboard/crisis/reports/research/sources pages and high-visibility page metadata.
4. Agent C: localize reusable components, chart labels, table labels, empty states, and read-model fallback copy.
5. Primary integrator: review all diffs, resolve overlap, run targeted checks, then broaden to `npm run web:gate` when feasible.
6. Write trace/session note if a reusable localization approach or root cause is confirmed.

## Acceptance Criteria

- Root site and primary navigation pages render Chinese UI by default.
- English remains only where it is a brand, acronym, API route, product term, source name, or intentionally bilingual label.
- Existing `/de` pages remain reachable and are not degraded.
- No API, deployment, release, sync, or secret surfaces are changed for localization.
- TypeScript/Next build validation passes through the selected web gate.
- Final diff is explainable by slice, with pre-existing changes called out separately from localization edits.

## Verification

- `git status --short` -> reviewed before and after implementation.
- `npm run web:gate` -> expected pass after localization.
- If `web:gate` is blocked by pre-existing unrelated failures, run the narrowest available checks and report exact blockers.
- Optional visual validation after gate: `npm run web:dev` plus Playwright/browser smoke for `/`, `/dashboard`, `/crisis`, `/research`, `/sources`, `/reports`, `/de`.

## Review Findings

- Approved to execute by user request on 2026-05-07.
- Main risk is overlap with existing dirty worktree. Mitigation: split by write set, avoid reverts, and inspect diffs before final verification.

## Approval State

verified

## Goal Packets

### Agent A: Shell And Landing

Allowed:

- `apps/web/components/shell.tsx`
- `apps/web/app/layout.tsx`
- `apps/web/app/page.tsx`
- `apps/web/src/locales/*.json`

Task:

Chinese-first copy for shell navigation, root metadata, home hero, CTA cards, primary metrics, and shared short labels. Preserve brand/product acronyms.

### Agent B: Primary Pages

Allowed:

- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/crisis/page.tsx`
- `apps/web/app/crisis/eu-jet-reserves/page.tsx`
- `apps/web/app/crisis/saf-tipping-point/page.tsx`
- `apps/web/app/research/page.tsx`
- `apps/web/app/reports/page.tsx`
- `apps/web/app/reports/tipping-point-analysis/page.tsx`
- `apps/web/app/sources/page.tsx`
- `apps/web/app/scenarios/page.tsx`
- `apps/web/app/prices/germany-jet-fuel/page.tsx`

Task:

Localize high-visibility route titles, metadata, empty states, tables, cards, and calls to action.

### Agent C: Components And Read Models

Allowed:

- `apps/web/components/*.tsx`
- `apps/web/lib/*.ts`
- focused tests under `test/**/*.mjs` only if changed behavior needs existing assertion updates

Task:

Localize reusable component labels, chart text, table headings, fallback messages, and read-model presentation strings without changing data contracts.

## Write-Back

- Final executor should report changed files, validation commands, pass/fail result, and remaining English terms that are intentionally preserved.
- Do not commit until the user explicitly approves after reviewing validation evidence.

## Execution Result

- 2026-05-07: Agent A localized shell, root layout, home page, and locale JSON.
- 2026-05-07: Agent B localized primary route pages and updated route copy contracts.
- 2026-05-07: Agent C localized reusable components/read-model presentation text and updated focused tests.
- Validation passed:
  - `node --experimental-strip-types --test test/market-signals.test.mjs test/sources-read-model.test.mjs test/tipping-point-workbench-contract.test.mjs test/product-read-model.test.mjs test/portfolio-read-model.test.mjs`
  - `npm run web:gate`
  - `npm test`
- Commit not performed. Current worktree also contains pre-existing refactor/API/UI changes, so commit slicing should be reviewed separately.
