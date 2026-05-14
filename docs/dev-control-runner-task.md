# Dev-Control Runner Task

## Goal

- Plan the safe convergence order for JetScope release, approval, sync, and deploy hardening.
- Classify the current dirty worktree before any commit, push, release, sync, or deploy.
- Define bounded follow-up tasks with explicit allowed files, validation commands, and blockers.

## Dirty Worktree Groups

- Source/config/tests: `package.json`, `test/release-approval-contract.test.mjs`.
- Docs: `AGENTS.md`, `OPERATIONS.md`, `PROJECT_PROGRESS.md`, `README.md`, `docs/AUTOMATION_LOOP.md`, `docs/DEPLOYMENT_GUIDE.md`, `scripts/README.md`.
- High-risk ops: `infra/server/health-check.sh`, `scripts/auto-deploy.sh`, `scripts/pr-approval-gate.mjs`, `scripts/publish-to-github.sh`, `scripts/release.sh`, `scripts/rollback.sh`.

## Safe-Local Follow-Up Candidates

- Docs reconciliation: allowed files `AGENTS.md`, `OPERATIONS.md`, `README.md`, `docs/AUTOMATION_LOOP.md`, `docs/DEPLOYMENT_GUIDE.md`, `scripts/README.md`; validation `git diff --check -- AGENTS.md OPERATIONS.md README.md docs/AUTOMATION_LOOP.md docs/DEPLOYMENT_GUIDE.md scripts/README.md`.
- Approval contract review: allowed files `package.json`, `test/release-approval-contract.test.mjs`, `scripts/pr-approval-gate.mjs`, `scripts/release.sh`, `scripts/publish-to-github.sh`; validation `npm test -- test/release-approval-contract.test.mjs` and `node scripts/pr-approval-gate.mjs --help`.
- Ops gate syntax audit: allowed files `infra/server/health-check.sh`, `scripts/auto-deploy.sh`, `scripts/publish-to-github.sh`, `scripts/release.sh`, `scripts/rollback.sh`; validation `bash -n infra/server/health-check.sh scripts/auto-deploy.sh scripts/publish-to-github.sh scripts/release.sh scripts/rollback.sh`.
- Sync boundary audit: node sync scripts are externalized to private workspace operations and should not be restored in this public product repository.

## Release/Deploy Approval Gate Blockers

- Do not commit, push, merge, release, deploy, or sync while these 17 files remain unreviewed in a dirty worktree.
- Treat all changes under `scripts/release.sh`, `scripts/publish-to-github.sh`, `scripts/auto-deploy.sh`, `scripts/rollback.sh`, and sync scripts as high-risk until reviewed with exact impact notes.
- Release approval remains blocked until `npm run preflight`, `scripts/security_check.sh`, and `scripts/review_push_guard.sh origin/main` are intentionally run in an approved release-prep task.
- Deploy approval remains blocked until the expected commit pin, deploy approval token flow, health-check behavior, and rollback path are validated without bypassing fail-closed gates.
