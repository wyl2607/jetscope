# JetScope Scripts

This directory contains JetScope project automation scripts.

## Current Scripts

- `jetscope-env`: POSIX self-discovery for `JETSCOPE_ROOT`
- `jetscope-env.ps1`: PowerShell self-discovery for `JETSCOPE_ROOT`
- `publish-to-github.sh`: validate and push JetScope to GitHub, writing `publish-event` records to the workspace data bus
- `security_check.sh`: fail-closed local safety gate for tracked/local-sensitive artifacts before push
- `review_push_guard.sh`: fail-closed outgoing-change guard against `origin/main` before push
- `sync-excludes.sh`: shared local-only and generated-artifact excludes for push/pull sync scripts
- `sync-to-nodes.sh`: sync the project from local machine to selected remote development nodes, writing `node-sync-event` records
- `sync-from-node.sh`: pull changes from a remote node back to local machine, writing `node-sync-event` records
- `release.sh`: unified release entrypoint that runs preflight, publishes to GitHub, then triggers commit-pinned VPS deploy
- `auto-deploy.sh`: production-side auto-deploy script, now also emitting `publish-event` records
- `rollback.sh`: production rollback script, now also emitting `publish-event` records
- `preflight-product-smoke.mjs`: product smoke verification
- `preflight-ui-e2e.mjs`: UI end-to-end verification
- `preflight-load-test.mjs`: load verification
- `preflight-load-test-v1.mjs`: v1 API load verification
- `automation-plan-check.mjs`: local validation for bounded parallel-development task specs
- `automation-scope-check.mjs`: compare changed files with an automation task spec's allowed and forbidden paths

## Data Bus Integration

Some private deployments can write operational events to an external workspace data bus:

- `tools/workspace-data-bus/topics/publish-event.jsonl`
- `tools/workspace-data-bus/topics/node-sync-event.jsonl`

Those tools are optional and are not required for a standard local checkout.

## Push Gates

`publish-to-github.sh` and the default `release.sh` path require these gates to exist and pass before any push:

```bash
./scripts/security_check.sh
./scripts/review_push_guard.sh origin/main
```

The gates fail closed when the worktree is dirty, blocked local/generated paths are tracked or outgoing, or sensitive untracked files are visible.

## Typical Workflow

```bash
cd ~/projects/jetscope
source scripts/jetscope-env
npm run release
```

### Release Variants

```bash
# Full local + VPS release; worker sync is not part of the default path
npm run release

# Skip remote VPS trigger when you only want to publish
./scripts/release.sh --skip-vps-deploy

# Re-run publish + VPS deploy without repeating preflight
./scripts/release.sh --skip-preflight

# Re-run VPS deploy only after confirming current HEAD is already on origin/main
./scripts/release.sh --skip-preflight --skip-publish

# Sync development workers before publishing
./scripts/release.sh --sync-workers

# Sync workers and Windows handoff before publishing
./scripts/release.sh --sync-workers --sync-windows

# Explicitly sync usa-vps:~/jetscope, which is not the production deploy path
./scripts/release.sh --sync-vps-workdir
```

### Node Sync Variants

```bash
# Default: sync mac-mini and coco only
./scripts/sync-to-nodes.sh

# Include Windows handoff sync
./scripts/sync-to-nodes.sh --windows

# Preview Unix worker changes without writing them
./scripts/sync-to-nodes.sh --dry-run

# Explicitly sync the non-production USA VPS workdir
./scripts/sync-to-nodes.sh --include-vps

# Pull back from a selected node using the shared excludes
./scripts/sync-from-node.sh mac-mini

# Pull back from the non-production USA VPS workdir only with explicit opt-in
./scripts/sync-from-node.sh usa-vps --allow-vps-workdir
```

Release and deploy behavior is also pinned in `../OPERATIONS.md`; treat that as the durable project memory for future sessions.

## Notes

- Legacy JetScope predecessor naming has been removed from active script entrypoints.
- Environment variable names like `SAFVSOIL_*` may still exist inside app/test code for compatibility and are not covered by this scripts README.
- Shared reusable script infrastructure lives in `~/tools/script-core/`.
- `usa-vps:/opt/jetscope` is the production deploy path. `usa-vps:~/jetscope` is a non-production workdir and is never synced unless explicitly requested.
- `scripts/sync-excludes.sh` is the single sync exclude source. Update it whenever `.gitignore` or local-only path policy changes.
- Unix worker sync performs a blocked-path readback after rsync. If historical excluded remnants remain on a node, sync fails instead of reporting a clean success.
- Windows opt-in sync is an overlay handoff sync, not a clean mirror. It performs a blocked-path readback after extraction, but it is not a full historical cleanup of every excluded file.
- Release fails closed before publishing when required push gates `scripts/security_check.sh` and `scripts/review_push_guard.sh` are missing or not executable.
- Private deployment wrappers may add extra observability around these scripts, but the checked-in scripts should remain runnable from this repository alone.
