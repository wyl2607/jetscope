import { readFileSync } from 'node:fs';

const defaultPlanPath = 'docs/automation-safe-local-task-example.json';

const requiredFields = [
  'task_id',
  'project',
  'goal',
  'mode',
  'risk',
  'conflict_group',
  'allowed_paths',
  'forbidden_paths',
  'verification',
  'max_attempts',
  'pr_policy',
  'merge_policy',
  'stop_conditions'
];

const forbiddenPathFragments = [
  '.env',
  '.automation',
  '.omx',
  'node_modules',
  '.next',
  'dist',
  'build',
  '.log'
];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim());
}

function checkTask(task, index) {
  const label = task?.task_id ?? `task at index ${index}`;

  for (const field of requiredFields) {
    if (!(field in task)) {
      fail(`${label}: missing required field ${field}`);
    }
  }

  if (!['read-only', 'write', 'review', 'verification'].includes(task.mode)) {
    fail(`${label}: mode must be read-only, write, review, or verification`);
  }

  if (!['low', 'medium', 'high'].includes(task.risk)) {
    fail(`${label}: risk must be low, medium, or high`);
  }

  if (!Number.isInteger(task.max_attempts) || task.max_attempts < 0 || task.max_attempts > 2) {
    fail(`${label}: max_attempts must be an integer from 0 to 2`);
  }

  for (const field of ['allowed_paths', 'forbidden_paths', 'verification', 'stop_conditions']) {
    if (!isStringArray(task[field])) {
      fail(`${label}: ${field} must be a non-empty string array`);
    }
  }

  if (task.mode === 'write' && task.risk === 'low' && task.verification.length === 0) {
    fail(`${label}: low-risk write tasks still need verification`);
  }

  for (const allowedPath of task.allowed_paths ?? []) {
    for (const fragment of forbiddenPathFragments) {
      if (allowedPath.includes(fragment)) {
        fail(`${label}: allowed path ${allowedPath} includes forbidden fragment ${fragment}`);
      }
    }
  }

  const requiredForbidden = ['.env', '.automation', '.omx'];
  for (const fragment of requiredForbidden) {
    if (!task.forbidden_paths.some((item) => item.includes(fragment))) {
      fail(`${label}: forbidden_paths should include ${fragment}`);
    }
  }
}

function main() {
  const planPath = process.argv[2] ?? defaultPlanPath;

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(planPath, 'utf8'));
  } catch (error) {
    console.error(`Failed to parse ${planPath} as JSON: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  const tasks = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.tasks) ? parsed.tasks : [parsed]);
  if (!Array.isArray(tasks) || tasks.length === 0) {
    fail('Task plan must be a non-empty array or an object with a non-empty tasks array');
  }

  tasks.forEach(checkTask);
  if (process.exitCode) {
    return;
  }
  console.log(`Automation task plan OK: ${tasks.length} task(s)`);
}

main();
