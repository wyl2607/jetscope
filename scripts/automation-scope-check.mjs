import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function normalizePath(value) {
  return value.replaceAll('\\\\', '/').replace(/^\.\//, '');
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else {
      source += escapeRegex(char);
    }
  }
  source += '$';
  return new RegExp(source);
}

function matchesAny(filePath, patterns) {
  const normalized = normalizePath(filePath);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

function loadTasks(planPath) {
  const parsed = JSON.parse(readFileSync(planPath, 'utf8'));
  const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('Task plan must be a non-empty array or an object with a non-empty tasks array');
  }
  return tasks;
}

function changedFiles(baseRef) {
  const output = execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], { encoding: 'utf8' });
  return output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function main() {
  const [planPath, baseRef = 'origin/main'] = process.argv.slice(2);
  if (!planPath) {
    console.error('Usage: node scripts/automation-scope-check.mjs <task-plan.json> [base-ref]');
    process.exit(2);
  }

  let tasks;
  let files;
  try {
    tasks = loadTasks(planPath);
    files = changedFiles(baseRef);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(`Automation scope OK: no changed files relative to ${baseRef}`);
    return;
  }

  for (const task of tasks) {
    const label = task?.task_id ?? 'unnamed task';
    const allowedPaths = task.allowed_paths ?? [];
    const forbiddenPaths = task.forbidden_paths ?? [];
    for (const filePath of files) {
      if (matchesAny(filePath, forbiddenPaths)) {
        fail(`${label}: changed file ${filePath} matches forbidden_paths`);
      }
      if (!matchesAny(filePath, allowedPaths)) {
        fail(`${label}: changed file ${filePath} is outside allowed_paths`);
      }
    }
  }

  if (process.exitCode) return;
  console.log(`Automation scope OK: ${files.length} changed file(s) within ${tasks.length} task spec(s)`);
}

main();
