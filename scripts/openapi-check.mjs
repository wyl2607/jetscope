import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(rootDir, 'apps', 'api');
const generatorPath = path.join(apiDir, 'generate_openapi.py');
const openApiPath = path.join(apiDir, 'openapi.json');

const candidates = [
  process.env.JETSCOPE_PYTHON_BIN,
  process.env.PYTHON_BIN,
  path.join(apiDir, '.venv', 'Scripts', 'python.exe'),
  path.join(apiDir, '.venv', 'bin', 'python'),
  process.platform === 'win32' ? 'python' : 'python3'
].filter(Boolean);

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env: {
      ...process.env,
      ...options.env
    }
  });
}

function resolvePython() {
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !existsSync(candidate)) {
      continue;
    }
    const result = run(candidate, ['--version']);
    if (result.status === 0) {
      return candidate;
    }
  }
  throw new Error(`Unable to find Python. Tried: ${candidates.join(', ')}`);
}

async function main() {
  const pythonBin = resolvePython();
  const tempDir = mkdtempSync(path.join(tmpdir(), 'jetscope-openapi-'));
  const generatedPath = path.join(tempDir, 'openapi.json');

  try {
    const result = run(pythonBin, [generatorPath], {
      stdio: 'inherit',
      env: {
        JETSCOPE_OPENAPI_OUTPUT: generatedPath
      }
    });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }

    const committed = readFileSync(openApiPath, 'utf8');
    const generated = readFileSync(generatedPath, 'utf8');
    if (committed !== generated) {
      console.error('OpenAPI schema is out of date. Run `npm run api:openapi` and commit apps/api/openapi.json.');
      process.exit(1);
    }

    console.log('OpenAPI schema is up to date.');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
