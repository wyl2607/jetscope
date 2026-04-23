# JetScope Operations Memory

Last updated: 2026-04-23

## Canonical Release Path

JetScope after a successful improvement must use one canonical release command:

```bash
cd ~/projects/jetscope
source scripts/safenv
npm run release
```

This is the default operational memory for future AI sessions. Do not re-discover or invent an alternative release flow unless the user explicitly changes it.

## Release Sequence

`npm run release` executes this exact order:

1. `npm run preflight`
2. `./scripts/sync-to-nodes.sh`
3. `./scripts/publish-to-github.sh`
4. `ssh usa-vps "cd /opt/jetscope && JETSCOPE_FORCE_DEPLOY=1 JETSCOPE_EXPECT_COMMIT=<local HEAD> ./scripts/auto-deploy.sh"`

## Operational Rules

- Build green is not enough; release is only complete when the VPS deploy step succeeds.
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
./scripts/release.sh --skip-preflight --skip-sync
```

## Known Gaps

- Local backend pytest execution is still not fully restored in this environment.
- `scripts/rollback.sh` is older and more destructive than the preferred release path; do not make it the default recovery flow without explicit user approval.
