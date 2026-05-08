import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const scriptPath = resolve('scripts/automation-scope-check.mjs');

function runInRepo(repoDir, planPath) {
  return execFileSync('node', [scriptPath, planPath, 'main'], {
    cwd: repoDir,
    encoding: 'utf8',
    stderr: 'pipe'
  });
}

function assertFails(repoDir, planPath, pattern) {
  try {
    runInRepo(repoDir, planPath);
    assert.fail('Expected automation scope check to fail');
  } catch (error) {
    const stderr = Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8') : String(error?.stderr ?? error);
    assert.match(stderr, pattern);
  }
}

function createRepo() {
  const repoDir = mkdtempSync(join(tmpdir(), 'jetscope-scope-check-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });
  writeFileSync(join(repoDir, 'README.md'), '# test\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoDir });
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: repoDir });
  execFileSync('git', ['switch', '-c', 'feature'], { cwd: repoDir });
  return repoDir;
}

function writePlan(repoDir, overrides = {}) {
  const plan = {
    tasks: [
      {
        task_id: 'scope-test',
        allowed_paths: ['docs/**'],
        forbidden_paths: ['.env*', '.automation/**', '.omx/**'],
        ...overrides
      }
    ]
  };
  const planPath = join(repoDir, 'task.json');
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  return planPath;
}

test('automation scope check accepts files inside allowed paths', () => {
  const repoDir = createRepo();
  execFileSync('git', ['checkout', '-b', 'feature-docs'], { cwd: repoDir });
  mkdirSync(join(repoDir, 'docs'));
  writeFileSync(join(repoDir, 'docs', 'notes.md'), 'ok\n');
  const output = runInRepo(repoDir, writePlan(repoDir));
  assert.match(output, /Automation scope OK/);
});

test('automation scope check defaults to a non-mutating command smoke check', () => {
  const output = execFileSync('node', [scriptPath], {
    encoding: 'utf8',
    stderr: 'pipe'
  });

  assert.match(output, /Automation scope OK: no changed files relative to HEAD/);
});

test('automation scope check rejects off-scope files', () => {
  const repoDir = createRepo();
  writeFileSync(join(repoDir, 'README.md'), '# changed\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoDir });
  execFileSync('git', ['commit', '-m', 'Change README'], { cwd: repoDir });
  assertFails(repoDir, writePlan(repoDir), /outside allowed_paths/);
});

test('automation scope check rejects forbidden files even when broadly allowed', () => {
  const repoDir = createRepo();
  writeFileSync(join(repoDir, '.env.local'), 'SECRET=1\n');
  execFileSync('git', ['add', '.env.local'], { cwd: repoDir });
  execFileSync('git', ['commit', '-m', 'Add forbidden env file'], { cwd: repoDir });
  assertFails(repoDir, writePlan(repoDir, { allowed_paths: ['**'] }), /matches forbidden_paths/);
});
