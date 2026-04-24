# JetScope Scripts

This directory contains JetScope project automation scripts.

## Current Scripts

- `safenv`: POSIX self-discovery for `JETSCOPE_ROOT`
- `safenv.ps1`: PowerShell self-discovery for `JETSCOPE_ROOT`
- `publish-to-github.sh`: validate and push JetScope to GitHub, writing `publish-event` records to the workspace data bus
- `sync-to-nodes.sh`: sync the project from local machine to remote development nodes, writing `node-sync-event` records
- `sync-from-node.sh`: pull changes from a remote node back to local machine, writing `node-sync-event` records
- `release.sh`: unified release entrypoint that runs preflight, syncs nodes, publishes to GitHub, then triggers VPS deploy
- `auto-deploy.sh`: production-side auto-deploy script, now also emitting `publish-event` records
- `rollback.sh`: production rollback script, now also emitting `publish-event` records
- `preflight-product-smoke.mjs`: product smoke verification
- `preflight-ui-e2e.mjs`: UI end-to-end verification
- `preflight-load-test.mjs`: load verification
- `preflight-load-test-v1.mjs`: v1 API load verification

## Data Bus Integration

Some private deployments can write operational events to an external workspace data bus:

- `tools/workspace-data-bus/topics/publish-event.jsonl`
- `tools/workspace-data-bus/topics/node-sync-event.jsonl`

Those tools are optional and are not required for a standard local checkout.

## Typical Workflow

```bash
cd ~/projects/jetscope
source scripts/safenv
npm run release
```

### Release Variants

```bash
# Full local + VPS release
npm run release

# Skip remote VPS trigger when you only want to publish
./scripts/release.sh --skip-vps-deploy

# Re-run publish + VPS deploy without repeating preflight
./scripts/release.sh --skip-preflight --skip-sync
```

Release and deploy behavior is also pinned in `../OPERATIONS.md`; treat that as the durable project memory for future sessions.

## Notes

- Legacy SAFvsOil naming has been removed from active script entrypoints.
- Environment variable names like `SAFVSOIL_*` may still exist inside app/test code for compatibility and are not covered by this scripts README.
- Private deployment wrappers may add extra observability around these scripts, but the checked-in scripts should remain runnable from this repository alone.
