import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
const tokenLedgerScript = readFileSync(join(process.cwd(), 'scripts/approval-token-ledger.sh'), 'utf8');
const reviewPushGuardScript = readFileSync(join(process.cwd(), 'scripts/review_push_guard.sh'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

const uniqueToken = (prefix) => `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function runScript(scriptPath, args = [], env = {}) {
  return spawnSync(scriptPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('release side effects require matching approval token', () => {
  assert.match(releaseScript, /ROOT="\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)\/\.\." && pwd\)"/);
  assert.match(releaseScript, /--approval-token\)\n\s+APPROVAL_TOKEN=/);
  assert.match(releaseScript, /APPROVE_JETSCOPE_RELEASE:-/);
  assert.match(releaseScript, /publish, sync, or deploy requires --approval-token/);
  assert.match(releaseScript, /record_release_approval_once\(\)/);
  assert.match(releaseScript, /PUBLISH_TOKEN=\$\(approval_token_derive "\$APPROVAL_TOKEN" "publish" "main:\$EXPECTED_COMMIT"\)/);
  assert.match(releaseScript, /SYNC_TOKEN=\$\(approval_token_derive "\$APPROVAL_TOKEN" "sync"/);
  assert.match(releaseScript, /head=\$\(git rev-parse HEAD\)/);
  assert.match(releaseScript, /DEPLOY_TOKEN=\$\(approval_token_derive "\$APPROVAL_TOKEN" "deploy" "\$\{VPS_HOST\}:\$\{VPS_DEPLOY_DIR\}:\$\{EXPECTED_COMMIT\}"\)/);
  assert.match(releaseScript, /APPROVE_JETSCOPE_PUBLISH="\$PUBLISH_TOKEN" \.\/scripts\/publish-to-github\.sh --approval-token "\$PUBLISH_TOKEN"/);
  assert.match(releaseScript, /APPROVE_JETSCOPE_DEPLOY='\$DEPLOY_TOKEN' bash \.\/scripts\/auto-deploy\.sh --approval-token '\$DEPLOY_TOKEN'/);
});

test('publish side effects require matching publish approval token', () => {
  assert.match(publishScript, /ROOT="\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)\/\.\." && pwd\)"/);
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
  assert.match(releaseScript, /assert_safe_remote_arg "deploy approval token" "\$DEPLOY_TOKEN"/);
});

test('approval token ledger records tokens once by hash', () => {
  assert.match(tokenLedgerScript, /approval_token_record_once\(\)/);
  assert.match(tokenLedgerScript, /approval_token_derive\(\)/);
  assert.match(tokenLedgerScript, /mkdir "\$path"/);
  assert.match(tokenLedgerScript, /approval token was already used/);
  assert.match(reviewPushGuardScript, /scripts\/approval-token-ledger\.sh/);
});

test('auto deploy requires an approved expected commit', () => {
  assert.match(autoDeployScript, /APPROVE_JETSCOPE_DEPLOY:-/);
  assert.match(autoDeployScript, /deploy requires --approval-token and matching APPROVE_JETSCOPE_DEPLOY/);
  assert.match(autoDeployScript, /if \[ -z "\$EXPECTED_COMMIT" \]/);
  assert.match(autoDeployScript, /expected commit required for deploy/);
  assert.match(autoDeployScript, /load_approval_token_ledger\(\)/);
  assert.match(autoDeployScript, /approval token ledger helper missing/);
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
  assert.match(healthCheckScript, /approval_token_record_once "health-restart"/);
  assert.match(healthCheckScript, /health restart ledger unavailable/);
  assert.match(healthCheckScript, /RESTART_APPROVED=1/);
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

test('approval token replay is blocked before repeated write sync', () => {
  const ledgerDir = mkdtempSync(join(tmpdir(), 'jetscope-approval-ledger-'));
  const token = uniqueToken('replay-token');
  try {
    const first = runScript('./scripts/sync-to-nodes.sh', ['--no-workers', '--approval-token', token], {
      APPROVE_JETSCOPE_SYNC: token,
      JETSCOPE_APPROVAL_LEDGER_DIR: ledgerDir,
    });
    assert.equal(first.status, 0);
    const second = runScript('./scripts/sync-to-nodes.sh', ['--no-workers', '--approval-token', token], {
      APPROVE_JETSCOPE_SYNC: token,
      JETSCOPE_APPROVAL_LEDGER_DIR: ledgerDir,
    });
    assert.equal(second.status, 0);

    const writeToken = uniqueToken('write-token');
    const firstRecord = spawnSync('bash', ['-c', 'source ./scripts/approval-token-ledger.sh && approval_token_record_once sync-push "$TOKEN" local-test'], {
      cwd: process.cwd(),
      env: { ...process.env, TOKEN: writeToken, JETSCOPE_APPROVAL_LEDGER_DIR: ledgerDir },
      encoding: 'utf8',
    });
    assert.equal(firstRecord.status, 0);

    const replay = spawnSync('bash', ['-c', 'source ./scripts/approval-token-ledger.sh && approval_token_record_once sync-push "$TOKEN" local-test'], {
      cwd: process.cwd(),
      env: { ...process.env, TOKEN: writeToken, JETSCOPE_APPROVAL_LEDGER_DIR: ledgerDir },
      encoding: 'utf8',
    });
    assert.notEqual(replay.status, 0);
    assert.match(`${replay.stdout}${replay.stderr}`, /approval token was already used/);
  } finally {
    rmSync(ledgerDir, { recursive: true, force: true });
  }
});

test('release preflight failure does not consume approval token', () => {
  const ledgerDir = mkdtempSync(join(tmpdir(), 'jetscope-release-ledger-'));
  const token = uniqueToken('release-preflight');
  try {
    const result = runScript('./scripts/release.sh', ['--approval-token', token], {
      APPROVE_JETSCOPE_RELEASE: token,
      JETSCOPE_APPROVAL_LEDGER_DIR: ledgerDir,
      PATH: '/nonexistent',
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /approval token was already used/);
  } finally {
    rmSync(ledgerDir, { recursive: true, force: true });
  }
});
