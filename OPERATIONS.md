# JetScope Operations Memory

Last updated: 2026-04-25

## Canonical Release Path

JetScope after a successful improvement must use one canonical release command:

```bash
cd ~/projects/jetscope
source scripts/safenv
npm run release
```

This is the default operational memory for future AI sessions. Do not re-discover or invent an alternative release flow unless the user explicitly changes it.

## Release Sequence

`npm run release` executes this exact order by default:

1. `npm run preflight`
2. `./scripts/publish-to-github.sh`
3. `ssh usa-vps "cd /opt/jetscope && JETSCOPE_FORCE_DEPLOY=1 JETSCOPE_EXPECT_COMMIT=<local HEAD> ./scripts/auto-deploy.sh"`

Development worker sync is now opt-in. It is not part of the default production release path.

## Operational Rules

- Build green is not enough; release is only complete when the VPS deploy step succeeds.
- Development node sync and production deploy are separate concerns.
- `mac-mini` and `coco` are the default development sync workers.
- `windows-pc` sync is opt-in because tar+scp is not a clean mirror cleanup mechanism.
- `usa-vps:~/jetscope` is a non-production workdir and must be synced only with explicit intent.
- `usa-vps:/opt/jetscope` remains the production source path and is updated only through commit-pinned deploy.
- `scripts/sync-excludes.sh` is the shared exclude source for push/pull sync. Update it alongside `.gitignore` when local-only or sensitive paths change.
- Windows opt-in sync now checks a small blocked-path set after extraction, but it still does not delete every possible historical excluded remnant.
- Push or release work must obey `/Users/yumei/.codex/memories/UNIVERSAL_AI_DEV_POLICY.md`.
- `scripts/release.sh` fails closed before publishing if required push gates `scripts/security_check.sh` and `scripts/review_push_guard.sh` are missing or not executable.
- `scripts/publish-to-github.sh` also runs the same push gates directly so it cannot bypass release safety.
- `.gitignore` is not a node-sync safety boundary; changes to local-only or sensitive ignore rules must be mirrored in `scripts/sync-excludes.sh`.
- The VPS deploy must target the exact commit that was just published from local.
- The VPS deploy must fail hard if:
  - origin/main is not yet at the expected commit
  - the deploy tree does not advance to that commit
  - API health check fails
  - web build times out or fails
  - final web health check fails
- Future AI runs should prefer `OPERATIONS.md` first for deployment behavior instead of re-checking scattered scripts.

## Allowed Variants

Use these only when there is a concrete reason:

```bash
# Publish only, skip VPS deploy
./scripts/release.sh --skip-vps-deploy

# Re-run publish + VPS deploy after a completed preflight
./scripts/release.sh --skip-preflight

# Re-run VPS deploy after confirming current HEAD is already on origin/main
./scripts/release.sh --skip-preflight --skip-publish

# Sync development workers before publishing
./scripts/release.sh --sync-workers

# Sync all development handoff nodes, excluding the VPS workdir
./scripts/release.sh --sync-workers --sync-windows

# Explicitly sync the non-production usa-vps workdir before publishing
./scripts/release.sh --sync-vps-workdir
```

## Known Gaps

- Local backend pytest execution is still not fully restored in this environment.
- `scripts/rollback.sh` is older and more destructive than the preferred release path; do not make it the default recovery flow without explicit user approval.
