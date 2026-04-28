import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PR_FIELDS = 'number,title,url,baseRefName,headRefName,headRefOid,isDraft,mergeable,mergeStateStatus,reviewDecision,state,files';
const CHECK_FIELDS = 'name,state,bucket,link,workflow';
const SAFE_CHECK_STATES = new Set(['SUCCESS', 'NEUTRAL', 'PASS']);
const FAIL_CHECK_STATES = new Set(['FAILURE', 'ERROR', 'ACTION_REQUIRED', 'TIMED_OUT', 'CANCELLED', 'FAIL']);
const HIGH_RISK_PATTERNS = [
  /^\.github\//,
  /^AGENTS\.md$/,
  /^OPERATIONS\.md$/,
  /^README\.md$/,
  /^PROJECT_PROGRESS\.md$/,
  /^docs\/AUTOMATION_/,
  /^docs\/automation-/,
  /^docs\/SECURITY_NOTES\.md$/,
  /^scripts\/README\.md$/,
  /^scripts\/(release|publish|sync|auto-deploy|rollback|review_push_guard|security_check|pr-approval-gate|automation-)/,
  /^scripts\/(deploy|ssh|rsync|install|uninstall|cleanup)/,
  /^infra\//,
  /^deploy\//,
  /^apps\/api\/migrations\//,
  /(^|\/)alembic\/versions\//,
  /(^|\/)package-lock\.json$/,
  /(^|\/)package\.json$/,
  /(^|\/)requirements\.txt$/,
  /(^|\/)\.env/,
  /(^|\/)\.automation(\/|$)/,
  /(^|\/)\.omx(\/|$)/,
  /(^|\/)apps\/api\/data(\/|$)/,
  /\.log$/
];

function usage() {
  console.log(`Usage: node scripts/pr-approval-gate.mjs --pr <number> [--base main] [--local-preflight-ok] [--security-audit-ok] [--python-audit-ok] [--execute --approval-token <token>] [--merge-method squash]

Default mode is read-only. It analyzes PR readiness and writes a local report.

Mark local verification evidence only after running it in this workspace:
  --local-preflight-ok after npm run preflight
  --security-audit-ok after npm run audit:security
  --python-audit-ok after npm run audit:python

Execution mode is intentionally fail-closed:
  --execute requires --approval-token and APPROVE_JETSCOPE_PR_MERGE with the same value.
  The script never pushes, deploys, syncs, or bypasses GitHub checks.
`);
}

function parseArgs(argv) {
  const args = { base: 'main', execute: false, mergeMethod: 'squash', report: 'reports/pr-approval-gate/latest.json' };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--help' || item === '-h') args.help = true;
    else if (item === '--pr') args.pr = argv[++index];
    else if (item === '--base') args.base = argv[++index];
    else if (item === '--execute') args.execute = true;
    else if (item === '--local-preflight-ok') args.localPreflightOk = true;
    else if (item === '--security-audit-ok') args.securityAuditOk = true;
    else if (item === '--python-audit-ok') args.pythonAuditOk = true;
    else if (item === '--approval-token') args.approvalToken = argv[++index];
    else if (item === '--merge-method') args.mergeMethod = argv[++index];
    else if (item === '--report') args.report = argv[++index];
    else throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

function runJson(command, args) {
  return JSON.parse(execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || 'null');
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function runLocalPushGates() {
  run('bash', ['scripts/security_check.sh']);
  run('bash', ['scripts/review_push_guard.sh', 'origin/main']);
}

function localHead() {
  return run('git', ['rev-parse', 'HEAD']);
}

function assertLocalHeadMatchesPr(args, pr) {
  if (!args.localPreflightOk && !args.execute) return;
  const head = localHead();
  if (head !== pr.headRefOid) {
    throw new Error(`local HEAD ${head} does not match PR head ${pr.headRefOid}`);
  }
}

function classifyChecks(checks) {
  const failed = [];
  const pending = [];
  for (const check of checks ?? []) {
    const values = [String(check.state ?? '').toUpperCase(), String(check.bucket ?? '').toUpperCase()].filter(Boolean);
    if (values.some((value) => FAIL_CHECK_STATES.has(value))) failed.push(check);
    else if (values.some((value) => value === 'SKIPPING' || value === 'SKIPPED')) pending.push(check);
    else if (!values.some((value) => SAFE_CHECK_STATES.has(value))) pending.push(check);
  }
  return { failed, pending };
}

function readiness(args, pr, checks) {
  const blockers = [];
  const warnings = [];
  const paths = (pr.files ?? []).map((item) => item.path).filter(Boolean);
  const checkState = classifyChecks(checks);
  const highRiskFiles = paths.filter((filePath) => HIGH_RISK_PATTERNS.some((pattern) => pattern.test(filePath)));
  const missingGates = ['scripts/security_check.sh', 'scripts/review_push_guard.sh'].filter((path) => !existsSync(path));
  if (String(pr.state ?? '').toUpperCase() !== 'OPEN') blockers.push(`PR state is ${pr.state}`);
  if (pr.baseRefName !== args.base) blockers.push(`base branch is ${pr.baseRefName}, expected ${args.base}`);
  if (pr.isDraft) blockers.push('PR is draft');
  if (String(pr.mergeable ?? '').toUpperCase() !== 'MERGEABLE') blockers.push(`mergeable is ${pr.mergeable}`);
  if (!['CLEAN', 'HAS_HOOKS'].includes(String(pr.mergeStateStatus ?? '').toUpperCase())) blockers.push(`mergeStateStatus is ${pr.mergeStateStatus || 'missing'}`);
  if (String(pr.reviewDecision ?? '').toUpperCase() !== 'APPROVED') blockers.push(`reviewDecision is ${pr.reviewDecision || 'missing'}`);
  if (!args.localPreflightOk) blockers.push('missing local preflight evidence: run npm run preflight and pass --local-preflight-ok');
  if (args.localPreflightOk) {
    try {
      assertLocalHeadMatchesPr(args, pr);
      runLocalPushGates();
    } catch (error) {
      blockers.push(`local push gates failed: ${error.stderr?.toString?.('utf8') || error.message || error}`);
    }
  }
  if (checkState.failed.length) blockers.push(`failed checks: ${checkState.failed.map((item) => item.name).join(', ')}`);
  if (checkState.pending.length) blockers.push(`pending/unknown checks: ${checkState.pending.map((item) => item.name).join(', ')}`);
  if (highRiskFiles.length) blockers.push(`high-risk files changed: ${highRiskFiles.join(', ')}`);
  if (missingGates.length) blockers.push(`missing local gates: ${missingGates.join(', ')}`);
  if (paths.length === 0) warnings.push('PR reports no changed files');
  if (!args.securityAuditOk) warnings.push('security audit evidence not provided');
  if (!args.pythonAuditOk) warnings.push('python audit evidence not provided');
  return { ready: blockers.length === 0, blockers, warnings, changed_files: paths, failed_checks: checkState.failed.map((item) => item.name), pending_checks: checkState.pending.map((item) => item.name), high_risk_files: highRiskFiles, local_verification: { preflight: args.localPreflightOk ? 'provided' : 'missing', security_audit: args.securityAuditOk ? 'provided' : 'not-provided', python_audit: args.pythonAuditOk ? 'provided' : 'not-provided' } };
}

function assertApproval(args) {
  if (!args.execute) return;
  if (!args.approvalToken) throw new Error('--execute requires --approval-token');
  if (process.env.APPROVE_JETSCOPE_PR_MERGE !== args.approvalToken) throw new Error('--execute requires APPROVE_JETSCOPE_PR_MERGE to match --approval-token');
  if (!['squash', 'merge', 'rebase'].includes(args.mergeMethod)) throw new Error('--merge-method must be squash, merge, or rebase');
}

function mergePr(args) {
  return run('gh', ['pr', 'merge', String(args.pr), `--${args.mergeMethod}`, '--match-head-commit', args.headRefOid, '--delete-branch=false']);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.pr || !/^\d+$/.test(String(args.pr))) throw new Error('--pr must be a numeric PR number');
  assertApproval(args);
  const reportPath = join(process.cwd(), args.report);
  mkdirSync(dirname(reportPath), { recursive: true });
  const pr = runJson('gh', ['pr', 'view', String(args.pr), '--json', PR_FIELDS]);
  const checks = runJson('gh', ['pr', 'checks', String(args.pr), '--json', CHECK_FIELDS]);
  assertLocalHeadMatchesPr(args, pr);
  const gate = readiness(args, pr, Array.isArray(checks) ? checks : []);
  const report = { generated_at: new Date().toISOString(), mode: args.execute ? 'execute' : 'read-only', pr: { number: pr.number, title: pr.title, url: pr.url, baseRefName: pr.baseRefName, headRefName: pr.headRefName, headRefOid: pr.headRefOid, mergeStateStatus: pr.mergeStateStatus, mergeable: pr.mergeable, reviewDecision: pr.reviewDecision, isDraft: pr.isDraft }, gate, blocked_actions_without_approval: ['merge', 'push', 'publish', 'deploy', 'sync'], next_step: gate.ready ? 'await explicit approval token before merge' : 'fix blockers before requesting merge approval' };
  if (args.execute) {
    if (!gate.ready) throw new Error(`PR is not ready: ${gate.blockers.join('; ')}`);
    args.headRefOid = pr.headRefOid;
    report.merge_output = mergePr(args);
    report.next_step = 'merged by explicit approval; run post-merge verification';
  }
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
