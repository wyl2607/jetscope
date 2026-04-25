# JetScope Project Progress

## Current Status

- Status: release/sync hardening is committed locally; backend pytest is restored as a local gate.
- Scope: JetScope web/API workspace, local data ignores, traceability entrypoint, release-path documentation, and worker/VPS sync boundaries.
- Release entrypoint: `npm run release` after `source scripts/jetscope-env`; development worker sync is opt-in.

## 2026-04-25 Safe-Local Automation Trial Prep

### Completed

- Added `docs/automation-safe-local-task-example.json` as the first bounded low-risk automation task contract.
- Updated `docs/AUTOMATION_LOOP.md` so the first autonomous write trial is documentation-only and explicitly blocks release, deploy, sync, SSH, rsync, publish, push, and merge actions.
- Narrowed the example task scope to `PROJECT_PROGRESS.md`, `docs/AUTOMATION_LOOP.md`, and the task JSON itself, with a tracked/untracked changed-file check and stop conditions against weakening guardrails or creating/modifying ignored forbidden artifacts relative to the controller pre-run snapshot.

### Verification

- `python3 -m json.tool docs/automation-safe-local-task-example.json >/dev/null`
- `test -f docs/AUTOMATION_LOOP.md`
- `(git diff --name-only HEAD; git ls-files --others --exclude-standard) | sort -u | grep -Ev '^(PROJECT_PROGRESS.md|docs/AUTOMATION_LOOP.md|docs/automation-safe-local-task-example.json)$' >/tmp/jetscope-safe-local-scope.err && exit 1 || test $? -eq 1`

### Impact

- JetScope now has a concrete safe-local task seed that can exercise automation planning without changing runtime behavior or touching high-risk operational scripts.

## 2026-04-25 Approval-Gated PR Merge Prep

### Completed

- Added `scripts/pr-approval-gate.mjs` as a fail-closed PR readiness and merge approval gate.
- Added `npm run pr:approval:gate` as the default read-only command for PR merge readiness reports.
- Documented explicit merge approval: actual merge requires `--execute`, `--approval-token`, and matching `APPROVE_JETSCOPE_PR_MERGE`.

### Verification

- `node scripts/pr-approval-gate.mjs --help`
- `bash -n` is not applicable to the Node script; syntax is checked by Node help execution.

### Impact

- The automation system can now develop and review toward a PR, then stop at `AWAIT_HUMAN_MERGE` until a human supplies the explicit approval token.
- The gate blocks draft PRs, non-`main` bases, unapproved reviews, non-mergeable PRs, failed or pending checks, high-risk file changes, and missing local push gates before any merge execution path can run.

## 2026-04-25 Backend Pytest Restoration

### Completed

- Verified system `python3 -m pytest` is not usable because Homebrew Python 3.14 has no pytest installed.
- Verified project venv pytest is usable: `apps/api/.venv/bin/python -m pytest tests` passed all backend tests.
- Added `npm run api:test` so backend pytest has a stable project-local entrypoint.
- Added `npm run api:test` to `npm run preflight` after `api:check` so compile-only validation is no longer the only API gate.

### Verification

- `.venv/bin/python -m pytest tests` passed: 80 tests.

### Impact

- Future API validation should use `npm run api:test` for backend behavior and `npm run api:check` only for Python compile/syntax checking.
- The backend test gate currently depends on the existing `apps/api/.venv`; recreating the venv remains a separate environment bootstrap concern.

## 2026-04-25 Sync Hardening Update

### Completed

- Added `scripts/sync-excludes.sh` as the shared exclude source for push and pull sync scripts.
- `scripts/sync-to-nodes.sh` now sources the shared excludes instead of carrying a private list.
- `scripts/sync-from-node.sh` now uses the same exclude list for Unix pullback, reducing the risk of pulling runtime/local-only artifacts back into local.
- Windows pull packaging was expanded to match the shared exclude policy as closely as the PowerShell/tar command path allows.
- Windows opt-in push sync now performs a minimal blocked-path readback after extraction for `.env`, `.env.local`, `.envrc`, `.omx`, `.automation`, and `apps/api/data`.
- Review fixes added pullback node validation, Windows push/pull failure event emission, local/remote temporary tar cleanup, wider Windows blocked-path readback, and fail-closed release push gates.
- Final review fix moved fail-closed push gate enforcement into `scripts/publish-to-github.sh` so direct publish and release both share the same gate.
- Final sync review fixes added Unix blocked-path readback after rsync and require `--allow-vps-workdir` before pulling from `usa-vps:~/jetscope`.
- Final readback compatibility fix removed GNU-only `find -printf` and made Unix `.env.*` readback recursive for macOS/BSD nodes.

### Impact

- Future local-only/sensitive path changes should update `scripts/sync-excludes.sh` instead of duplicating exclude lists across sync scripts.
- Windows opt-in sync is still overlay handoff sync, not a clean mirror; readback catches known blocked paths but does not replace a full cleanup strategy.
- Unix sync now fails if historical blocked remnants remain after rsync; cleanup still requires a separate explicit cleanup action.
- Default `npm run release` and direct `./scripts/publish-to-github.sh` now fail before push if `scripts/security_check.sh` or `scripts/review_push_guard.sh` is missing or not executable.
- No real sync, pullback, publish, deploy, VPS cleanup, commit, or push was executed during this hardening pass.

## 2026-04-25 Push Gate Addition

### Completed

- Added `scripts/security_check.sh` as the local safety gate for blocked tracked files, visible sensitive untracked files, and credential-like staged names.
- Added `scripts/review_push_guard.sh` as the outgoing-change guard against `origin/main`.
- `scripts/publish-to-github.sh` runs both gates before any push, so direct publish and default release share the same fail-closed behavior.
- Review fixes expanded gate coverage for nested `.env*` files, explicitly allowlisted `.env.example` and `*.env.*.example`, blocked common generated artifacts from `.gitignore`, and moved gate existence checks before `web:gate`.
- Final review fixes added credential-like outgoing file checks to `scripts/review_push_guard.sh` and made `scripts/publish-to-github.sh` require current branch `main` before pushing `HEAD:refs/heads/main`.

### Impact

- Publishing now requires a clean worktree plus passing gates.
- Current local working tree is intentionally dirty while this change is in progress, so publish/release should remain blocked until reviewed and committed intentionally.

### Verification

- `bash -n scripts/security_check.sh scripts/review_push_guard.sh scripts/publish-to-github.sh scripts/release.sh scripts/sync-excludes.sh scripts/sync-to-nodes.sh scripts/sync-from-node.sh` passed.
- `./scripts/security_check.sh` passed.
- `./scripts/review_push_guard.sh origin/main` failed as expected because the worktree is dirty.
- `./scripts/release.sh --skip-preflight --skip-publish --skip-vps-deploy` passed as a local-only no-op path.
- `./scripts/release.sh --skip-preflight --skip-vps-deploy` failed before publish because the worktree is dirty.
- `git diff --check` passed.
- Final independent read-only review found no remaining severe findings. Residual risks: filename-based guards are heuristic, `origin/main` freshness still depends on fetch, and Git gates do not clean historical remote/node remnants.
- Follow-up review flagged the existing `scripts/preflight-ui-e2e.mjs` local change as a release-gate risk because it weakens admin refresh coverage; it was not changed in this sync/publish hardening pass.
- Final sync readback review found no remaining severe issue in Unix readback or `usa-vps` pull opt-in. Residual risk: readback is a known blocked-path check, not full sensitive-content scanning.

### Verification

- `bash -n scripts/sync-excludes.sh scripts/sync-to-nodes.sh scripts/sync-from-node.sh scripts/release.sh` passed.
- `./scripts/sync-to-nodes.sh --help` passed.
- `./scripts/release.sh --help` passed.
- `git diff --check` passed.
- `./scripts/release.sh --skip-preflight --skip-vps-deploy` failed closed before publish because the worktree is dirty; push gates are also enforced inside `scripts/publish-to-github.sh` before any push can run.
- `./scripts/release.sh --skip-preflight --skip-publish --skip-vps-deploy` passed as a local-only no-op verification path.

## 2026-04-25 Sync/Release Boundary Update

### Completed

- `scripts/sync-to-nodes.sh` now defaults to development workers only: `mac-mini` and `coco`.
- `windows-pc` sync is opt-in through `--windows` or `--all-dev`.
- `usa-vps:~/jetscope` sync is opt-in through `--include-vps` and remains a non-production workdir.
- `scripts/release.sh` no longer runs node sync by default; production release is `preflight -> publish -> commit-pinned usa-vps:/opt/jetscope deploy`.
- Optional release sync flags were added: `--sync-workers`, `--sync-windows`, and `--sync-vps-workdir`.
- `--skip-sync` remains accepted as a legacy no-op because sync is now opt-in by default.

### Verification

- `bash -n scripts/sync-to-nodes.sh scripts/release.sh scripts/sync-from-node.sh` passed.
- `./scripts/sync-to-nodes.sh --help` passed.
- `./scripts/release.sh --help` passed after restoring the executable bit on `scripts/release.sh`.
- `git diff --check` passed.

### Impact

- Default production release no longer writes to `mac-mini`, `coco`, `windows-pc`, or `usa-vps:~/jetscope` before publishing.
- `usa-vps:/opt/jetscope` remains the production deploy target and is still protected by `JETSCOPE_EXPECT_COMMIT` in `scripts/auto-deploy.sh`.
- This first round intentionally did not change `scripts/auto-deploy.sh`, did not execute real sync, did not deploy, did not clean VPS tools, and did not push or commit.

### Next Candidates

- Extract shared push/pull excludes so `sync-from-node.sh` cannot pull back runtime/local-only artifacts missed by the push exclude list.
- Add Windows readback/sensitive-file checks after opt-in Windows sync.
- Harden `scripts/auto-deploy.sh` with explicit fetch/ff-only behavior, bounded health retry, and last-good commit/rollback support.
- Handle `usa-vps` AI tool cleanup phase 1 only after separate explicit approval.

## 2026-04-24 Development-Zone Baseline

### Completed

- Local API data is ignored through `apps/api/data/` and local SQLite ignores.
- Cross-AI traceability entrypoint is documented in `AGENTS.md`.
- `api:dev` uses the project virtualenv uvicorn path to avoid global Python drift.
- Release documentation is aligned around `npm run release` as the default operational path.
- `scripts/sync-to-nodes.sh` excludes are aligned with local-only and sensitive `.gitignore` rules so node sync does not bypass Git safety boundaries.

### Verification

- `git check-ignore -v apps/api/data apps/api/data/market.db .automation .omx apps/api/.env.api-keys` passed.
- `npm run api:check` passed.
- `npm test` passed: 16 tests.
- `npm run web:typecheck` passed.
- `bash -n scripts/sync-to-nodes.sh` passed.

### Open Items

- Full backend pytest is not yet the canonical local API gate in this environment; `npm run api:check` is compile-only.
- Publishing and VPS deploy remain high-risk operations and require explicit user approval.
- If repository-local `scripts/security_check.sh` or `scripts/review_push_guard.sh` are added later, wire them into push/release gates.
- Windows `tar+scp` sync prevents newly excluded files from being packaged, but it does not delete historical excluded remnants on the Windows target; add a cleanup/readback step before relying on Windows as a clean mirror.

## 2026-04-25 Release/Sync Boundary Close-Out

- Default `npm run release` now runs preflight, GitHub publish, then commit-pinned VPS deploy; development worker sync is opt-in.
- `scripts/sync-excludes.sh` is the shared exclude source for push/pull sync, aligned with local-only and sensitive ignore rules.
- Default `sync-to-nodes.sh` targets only `mac-mini` and `coco`; Windows and `usa-vps:~/jetscope` require explicit flags.
- Verification passed: shell syntax for release/sync scripts, sync dry-run empty paths, API compile, 16 node tests, web typecheck, and web gate.
