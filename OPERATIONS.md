# JetScope Operations Memory

Last updated: 2026-04-25

## Canonical Release Path

JetScope after a successful improvement must use one canonical release command:

```bash
cd ~/projects/jetscope
source scripts/jetscope-env
APPROVE_JETSCOPE_RELEASE=<approval-token> ./scripts/release.sh --approval-token <approval-token>
```

This is the default operational memory for future AI sessions. Do not re-discover or invent an alternative release flow unless the user explicitly changes it.

## Release Sequence

`./scripts/release.sh --approval-token <approval-token>` executes this exact order by default after `APPROVE_JETSCOPE_RELEASE` matches the token:

1. `npm run preflight`
2. `./scripts/publish-to-github.sh`
3. `ssh <production-host> "cd /opt/jetscope && JETSCOPE_FORCE_DEPLOY=1 JETSCOPE_EXPECT_COMMIT=<local HEAD> APPROVE_JETSCOPE_DEPLOY=<approval-token> ./scripts/auto-deploy.sh --approval-token <approval-token>"`

Development worker sync is now opt-in. It is not part of the default production release path.

## Operational Rules

- Build green is not enough; release is only complete when the VPS deploy step succeeds.
- Development node sync and production deploy are separate concerns; node sync lives in private workspace operations, not this public product repository.
- Direct node sync and pullback must remain approval-gated outside this repository.
- `<production-host>:/opt/jetscope` remains the production source path and is updated only through commit-pinned deploy.
- Push or release work must obey the operator's private release policy in the active workspace.
- `scripts/publish-to-github.sh` fails closed before pushing if required push gates `scripts/security_check.sh` and `scripts/review_push_guard.sh` are missing, not executable, or fail.
- `scripts/release.sh` delegates publish safety to `scripts/publish-to-github.sh`, so direct publish and release share the same fail-closed push gates.
- `scripts/release.sh` requires `JETSCOPE_VPS_HOST` to be set to the approved production SSH host for production release.
- `infra/server/health-check.sh` is observe-only by default. Service restart requires `JETSCOPE_HEALTH_ALLOW_RESTART=1`, `JETSCOPE_HEALTH_RESTART_TOKEN`, and matching `APPROVE_JETSCOPE_HEALTH_RESTART` as an explicit operational exception.
- `.gitignore` is not a node-sync safety boundary; changes to local-only or sensitive ignore rules must be mirrored in `scripts/sync-excludes.sh`.
- The VPS deploy must target the exact commit that was just published from local.
- Approval tokens are operator-supplied action nonces. Generate them per action, keep them short-lived, and do not reuse a release, deploy, rollback, sync, publish, or PR merge token for another action. Side-effect scripts record token hashes through `scripts/approval-token-ledger.sh` and reject replay on the same machine; cross-machine one-time behavior depends on the target machine ledger.
- The VPS deploy fails closed unless `APPROVE_JETSCOPE_DEPLOY` matches `--approval-token` and `JETSCOPE_EXPECT_COMMIT` is set to the approved commit. PR merge approval is not deploy approval.
- The VPS deploy fetches `origin/main` into `refs/remotes/origin/main` first and only advances the production checkout with `git merge --ff-only origin/main`.
- The production API owner is the `jetscope-api` Docker container from `docker-compose.prod.yml`; legacy `jetscope-api.service` must stay inactive. The production web owner is `jetscope-web.service`.
- Auto-deploy uses an atomic lock directory and records last success/failure under `/var/lib/jetscope/deploy-state`; it will not skip a same-commit deploy unless that commit is recorded successful and API/Web are currently healthy.
- The VPS deploy must fail hard if:
  - origin/main is not yet at the expected commit
  - `/opt/jetscope` is not on branch `main`
  - the deploy checkout cannot fast-forward to origin/main
  - the deploy tree does not advance to that commit
  - API health check fails within the bounded retry window
  - web build times out or fails
  - final web health check fails within the bounded retry window
- Auto-deploy failure handling is fail-closed and observable, but not transactional rollback. If API/Web restart or health checks fail after a fast-forward, use the deployment logs plus explicit operator recovery; do not assume automatic rollback.
- Future AI runs should prefer `OPERATIONS.md` first for deployment behavior instead of re-checking scattered scripts.

## Recovery Direction

Current recovery is operator-managed. `scripts/rollback.sh` rolls back by `HEAD~1` and rebuilds in place, so it is not the preferred automatic recovery mechanism for production. It requires `APPROVE_JETSCOPE_ROLLBACK` plus `--approval-token`, requires the production checkout to be on `main`, and refuses dirty production checkouts instead of stashing or reapplying local state.

The next safe recovery implementation should be last-good or artifact-first, not ad hoc reset-based rollback:

1. Record `LAST_GOOD_COMMIT` before fast-forwarding production.
2. Build API/Web artifacts for the requested commit before switching live services where feasible.
3. If a post-switch health check fails, restore the recorded last-good commit or artifact and rerun bounded health checks.
4. Emit deployment events for start, fail, restore-start, restore-success, and restore-failed states.
5. Keep destructive cleanup, manual `git reset --hard`, and service stop/start commands behind explicit operator approval until the recovery path is tested on the VPS.

## Allowed Variants

Use these only when there is a concrete reason:

```bash
# Publish only, skip VPS deploy
APPROVE_JETSCOPE_RELEASE=<approval-token> ./scripts/release.sh --approval-token <approval-token> --skip-vps-deploy

# Re-run publish + VPS deploy after a completed preflight
APPROVE_JETSCOPE_RELEASE=<approval-token> ./scripts/release.sh --approval-token <approval-token> --skip-preflight

# Re-run VPS deploy after confirming current HEAD is already on origin/main
APPROVE_JETSCOPE_RELEASE=<approval-token> ./scripts/release.sh --approval-token <approval-token> --skip-preflight --skip-publish

# Node sync is externalized to private workspace operations and is not a public release variant.
```

## Known Gaps

- Local backend pytest is restored through `npm run api:test`, which uses `apps/api/.venv/bin/python -m pytest tests`.
- `scripts/rollback.sh` is older and more destructive than the preferred release path; do not make it the default recovery flow without explicit user approval.
- Content-level secret scanning uses `gitleaks` when installed; otherwise `scripts/security_check.sh` falls back to a built-in high-signal pattern scan and logs a warning.
