import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const apiDir = join(rootDir, 'apps/api');

const candidates = [
  process.env.JETSCOPE_PYTHON_BIN,
  process.env.PYTHON_BIN,
  join(apiDir, '.venv/Scripts/python.exe'),
  join(apiDir, '.venv/bin/python'),
  process.platform === 'win32' ? 'python' : 'python3',
  'python'
].filter(Boolean);

function works(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

const python = candidates.find((candidate) => {
  if (candidate.includes('/') || candidate.includes('\\')) {
    return existsSync(candidate) && works(candidate);
  }
  return works(candidate);
});

if (!python) {
  console.error('No usable Python interpreter found. Set JETSCOPE_PYTHON_BIN to your API virtualenv python.');
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
// Allow `npm run api:test -- path::test` without double-including the suite root.
const pytestArgs = extraArgs.length > 0 ? extraArgs : ['tests'];
const result = spawnSync(python, ['-m', 'pytest', ...pytestArgs], {
  cwd: apiDir,
  stdio: 'inherit'
});

process.exit(result.status ?? 1);
