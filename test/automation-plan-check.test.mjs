import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const scriptPath = resolve('scripts/automation-plan-check.mjs');

function writePlan(plan) {
  const dir = mkdtempSync(join(tmpdir(), 'jetscope-plan-check-'));
  const path = join(dir, 'task.json');
  writeFileSync(path, JSON.stringify(plan, null, 2));
  return path;
}

function validPlan(overrides = {}) {
  return {
    task_id: 'docs-only',
    project: 'jetscope',
    goal: 'Document a safe local automation task.',
    mode: 'write',
    risk: 'low',
    conflict_group: 'docs',
    allowed_paths: ['docs/AUTOMATION_LOOP.md'],
    forbidden_paths: ['.env*', '.automation/**', '.omx/**'],
    verification: ['test -f docs/AUTOMATION_LOOP.md'],
    max_attempts: 2,
    pr_policy: 'required-before-main',
    merge_policy: 'human-or-controller-after-ci',
    stop_conditions: ['touches forbidden path'],
    ...overrides
  };
}

function run(plan) {
  return execFileSync('node', [scriptPath, writePlan(plan)], {
    encoding: 'utf8',
    stderr: 'pipe'
  });
}

function assertFails(plan, pattern) {
  try {
    run(plan);
    assert.fail('Expected automation plan check to fail');
  } catch (error) {
    const stderr = Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8') : String(error?.stderr ?? error);
    assert.match(stderr, pattern);
  }
}

test('automation plan check accepts the safe-local example contract', () => {
  const output = execFileSync('node', [scriptPath, 'docs/automation-safe-local-task-example.json'], {
    encoding: 'utf8'
  });

  assert.match(output, /Automation task plan OK: 1 task/);
});

test('automation plan check defaults to the checked-in safe-local example', () => {
  const output = execFileSync('node', [scriptPath], {
    encoding: 'utf8'
  });

  assert.match(output, /Automation task plan OK: 1 task/);
});

test('automation plan check rejects allowed forbidden paths', () => {
  assertFails(validPlan({ allowed_paths: ['.automation/run.json'] }), /includes forbidden fragment \.automation/);
});

test('automation plan check requires core forbidden path coverage', () => {
  assertFails(validPlan({ forbidden_paths: ['.env*', '.omx/**'] }), /forbidden_paths should include \.automation/);
});
