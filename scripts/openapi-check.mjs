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
    // Deep-stable stringify so Windows/Linux dict order / whitespace do not fail CI.
    const stableStringify = (value) => {
      if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
      }
      if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
      }
      return JSON.stringify(value);
    };
    let committedNorm;
    let generatedNorm;
    try {
      committedNorm = stableStringify(JSON.parse(committed.replace(/^\uFEFF/, '')));
      generatedNorm = stableStringify(JSON.parse(generated.replace(/^\uFEFF/, '')));
    } catch (error) {
      console.error('Failed to parse OpenAPI JSON for comparison:', error);
      process.exit(1);
    }
    if (committedNorm !== generatedNorm) {
      console.error('OpenAPI schema is out of date. Run `npm run api:openapi` and commit apps/api/openapi.json.');
      const cPaths = Object.keys(JSON.parse(committed).paths || {}).sort();
      const gPaths = Object.keys(JSON.parse(generated).paths || {}).sort();
      console.error(`committed paths=${cPaths.length} generated paths=${gPaths.length}`);
      const onlyC = cPaths.filter((p) => !gPaths.includes(p));
      const onlyG = gPaths.filter((p) => !cPaths.includes(p));
      if (onlyC.length) console.error(`only committed: ${onlyC.join(', ')}`);
      if (onlyG.length) console.error(`only generated: ${onlyG.join(', ')}`);
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
