import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

const releaseScript = readFileSync(join(process.cwd(), 'scripts/release.sh'), 'utf8');
const publishScript = readFileSync(join(process.cwd(), 'scripts/publish-to-github.sh'), 'utf8');
const autoDeployScript = readFileSync(join(process.cwd(), 'scripts/auto-deploy.sh'), 'utf8');
const prGateScript = readFileSync(join(process.cwd(), 'scripts/pr-approval-gate.mjs'), 'utf8');
const syncToScript = readFileSync(join(process.cwd(), 'scripts/sync-to-nodes.sh'), 'utf8');
const syncFromScript = readFileSync(join(process.cwd(), 'scripts/sync-from-node.sh'), 'utf8');
const rollbackScript = readFileSync(join(process.cwd(), 'scripts/rollback.sh'), 'utf8');
const healthCheckScript = readFileSync(join(process.cwd(), 'infra/server/health-check.sh'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

function runScript(scriptPath, args = [], env = {}) {
  return spawnSync(scriptPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('release side effects require matching approval token', () => {
  assert.match(releaseScript, /--approval-token\)\n\s+APPROVAL_TOKEN=/);
  assert.match(releaseScript, /APPROVE_JETSCOPE_RELEASE:-/);
  assert.match(releaseScript, /publish, sync, or deploy requires --approval-token/);
  assert.match(releaseScript, /APPROVE_JETSCOPE_PUBLISH="\$APPROVAL_TOKEN" \.\/scripts\/publish-to-github\.sh --approval-token "\$APPROVAL_TOKEN"/);
  assert.match(releaseScript, /APPROVE_JETSCOPE_DEPLOY='\$APPROVAL_TOKEN' \.\/scripts\/auto-deploy\.sh --approval-token '\$APPROVAL_TOKEN'/);
});

test('publish side effects require matching publish approval token', () => {
  assert.match(publishScript, /--approval-token\)\n\s+APPROVAL_TOKEN=/);
  assert.match(publishScript, /APPROVE_JETSCOPE_PUBLISH:-/);
  assert.match(publishScript, /publish requires --approval-token and matching APPROVE_JETSCOPE_PUBLISH/);
  assert.match(publishScript, /HEAD changed after push gates/);
  assert.match(publishScript, /GATED_COMMIT="\$\(git rev-parse HEAD\)"/);
  assert.match(publishScript, /LOCAL_COMMIT="\$GATED_COMMIT"/);
  assert.match(publishScript, /git push "\$REMOTE_NAME" "\$LOCAL_COMMIT:refs\/heads\/\$BRANCH_NAME"/);
});

test('release rejects unsafe remote command arguments before deploy ssh', () => {
  assert.match(releaseScript, /assert_safe_remote_arg\(\)/);
  assert.match(releaseScript, /assert_safe_ssh_host\(\)/);
  assert.match(releaseScript, /JETSCOPE_VPS_HOST must be the approved production host alias: usa-vps/);
  assert.match(releaseScript, /\^\[A-Za-z0-9\._\/@:=,\+-\]\+\$/);
  assert.match(releaseScript, /assert_safe_ssh_host "\$VPS_HOST"/);
  assert.match(releaseScript, /assert_safe_remote_arg "JETSCOPE_VPS_DEPLOY_DIR" "\$VPS_DEPLOY_DIR"/);
  assert.match(releaseScript, /assert_safe_remote_arg "approval token" "\$APPROVAL_TOKEN"/);
});

test('auto deploy requires an approved expected commit', () => {
  assert.match(autoDeployScript, /APPROVE_JETSCOPE_DEPLOY:-/);
  assert.match(autoDeployScript, /deploy requires --approval-token and matching APPROVE_JETSCOPE_DEPLOY/);
  assert.match(autoDeployScript, /if \[ -z "\$EXPECTED_COMMIT" \]/);
  assert.match(autoDeployScript, /expected commit required for deploy/);
});

test('auto deploy reconciles healthy same-commit state before skipping', () => {
  assert.match(autoDeployScript, /\[ "\$FORCE_DEPLOY" != "1" \] && \[ "\$LOCAL_COMMIT" = "\$REMOTE_COMMIT" \]/);
  assert.match(autoDeployScript, /\[ "\$LAST_SUCCESS" != "\$REMOTE_COMMIT" \] \|\| \[ "\$LAST_FAILURE" = "\$REMOTE_COMMIT" \]/);
  assert.match(autoDeployScript, /write_state_file "\$LAST_SUCCESS_FILE" "\$REMOTE_COMMIT"/);
  assert.match(autoDeployScript, /LAST_FAILURE=""/);
  assert.match(autoDeployScript, /failed to reconcile healthy deploy state/);
  assert.match(autoDeployScript, /auto-deploy found no upstream changes/);
});

test('package exposes the read-only PR approval gate command', () => {
  assert.equal(packageJson.scripts['pr:approval:gate'], 'node scripts/pr-approval-gate.mjs');
});

test('PR gate treats operational policy docs as high risk', () => {
  assert.match(prGateScript, /\^OPERATIONS\\\.md\$/);
  assert.match(prGateScript, /\^README\\\.md\$/);
  assert.match(prGateScript, /\^scripts\\\/README\\\.md\$/);
});

test('direct node sync requires matching approval token', () => {
  assert.match(syncToScript, /APPROVE_JETSCOPE_SYNC:-/);
  assert.match(syncToScript, /sync requires --approval-token and matching APPROVE_JETSCOPE_SYNC/);
  assert.match(syncFromScript, /APPROVE_JETSCOPE_SYNC:-/);
  assert.match(syncFromScript, /pull sync requires --approval-token and matching APPROVE_JETSCOPE_SYNC/);
});

test('PR gate runs local push gates when local preflight evidence is provided', () => {
  assert.match(prGateScript, /local HEAD/);
  assert.match(prGateScript, /does not match PR head/);
  assert.match(prGateScript, /assertLocalHeadMatchesPr\(args, pr\);/);
  assert.match(prGateScript, /scripts\/security_check\.sh/);
  assert.match(prGateScript, /scripts\/review_push_guard\.sh', 'origin\/main'/);
  assert.match(prGateScript, /local push gates failed/);
});

test('PR gate execute mode pins local HEAD to the reviewed PR head', () => {
  assert.match(prGateScript, /if \(!args\.localPreflightOk && !args\.execute\) return/);
  assert.match(prGateScript, /mergePr\(args\)/);
  assert.match(prGateScript, /--match-head-commit/);
});

test('windows sync readback checks nested env files', () => {
  assert.match(syncToScript, /-Recurse -File -Filter '\.env\.\*'/);
});

test('rollback requires matching approval token', () => {
  assert.match(rollbackScript, /APPROVE_JETSCOPE_ROLLBACK:-/);
  assert.match(rollbackScript, /rollback requires --approval-token and matching APPROVE_JETSCOPE_ROLLBACK/);
  assert.match(rollbackScript, /rollback requires production checkout on main/);
  assert.match(rollbackScript, /rollback requires a clean production checkout/);
  assert.doesNotMatch(rollbackScript, /git stash/);
});

test('health check restarts are explicit opt-in', () => {
  assert.match(healthCheckScript, /JETSCOPE_HEALTH_ALLOW_RESTART:-0/);
  assert.match(healthCheckScript, /JETSCOPE_HEALTH_RESTART_TOKEN:-/);
  assert.match(healthCheckScript, /APPROVE_JETSCOPE_HEALTH_RESTART:-/);
  assert.match(healthCheckScript, /Restart disabled or unapproved; emitting failure only/);
});

test('release exits before side effects when approval token is missing', () => {
  const result = runScript('./scripts/release.sh', ['--skip-preflight', '--skip-publish', '--skip-vps-deploy']);
  assert.equal(result.status, 0);
  const denied = runScript('./scripts/release.sh', ['--skip-preflight', '--skip-vps-deploy']);
  assert.notEqual(denied.status, 0);
  assert.match(`${denied.stdout}${denied.stderr}`, /publish, sync, or deploy requires --approval-token/);
});

test('direct publish exits before push gates when approval token is missing', () => {
  const result = runScript('./scripts/publish-to-github.sh');
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /publish requires --approval-token and matching APPROVE_JETSCOPE_PUBLISH/);
});

test('sync-to-nodes dry-run is approval-free but write sync requires approval', () => {
  const dryRun = runScript('./scripts/sync-to-nodes.sh', ['--dry-run', '--no-workers']);
  assert.equal(dryRun.status, 0);
  const writeSync = runScript('./scripts/sync-to-nodes.sh', ['--no-workers']);
  assert.notEqual(writeSync.status, 0);
  assert.match(`${writeSync.stdout}${writeSync.stderr}`, /sync requires --approval-token and matching APPROVE_JETSCOPE_SYNC/);
});
