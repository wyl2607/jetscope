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

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function findFirstDiff(committed, generated, pathPrefix = '$') {
  if (committed === generated) {
    return null;
  }
  if (typeof committed !== typeof generated) {
    return `${pathPrefix}: type ${typeof committed} vs ${typeof generated}`;
  }
  if (Array.isArray(committed) && Array.isArray(generated)) {
    if (committed.length !== generated.length) {
      return `${pathPrefix}: array length ${committed.length} vs ${generated.length}`;
    }
    for (let i = 0; i < committed.length; i += 1) {
      const found = findFirstDiff(committed[i], generated[i], `${pathPrefix}[${i}]`);
      if (found) {
        return found;
      }
    }
    return `${pathPrefix}: array content differs`;
  }
  if (committed && generated && typeof committed === 'object' && typeof generated === 'object') {
    const cKeys = Object.keys(committed).sort();
    const gKeys = Object.keys(generated).sort();
    const onlyC = cKeys.filter((key) => !gKeys.includes(key));
    const onlyG = gKeys.filter((key) => !cKeys.includes(key));
    if (onlyC.length || onlyG.length) {
      const parts = [];
      if (onlyC.length) {
        parts.push(`only committed: ${onlyC.slice(0, 8).join(', ')}`);
      }
      if (onlyG.length) {
        parts.push(`only generated: ${onlyG.slice(0, 8).join(', ')}`);
      }
      return `${pathPrefix}: keys differ (${parts.join('; ')})`;
    }
    for (const key of cKeys) {
      const found = findFirstDiff(committed[key], generated[key], `${pathPrefix}.${key}`);
      if (found) {
        return found;
      }
    }
    return `${pathPrefix}: object content differs`;
  }
  return `${pathPrefix}: value ${JSON.stringify(committed)} vs ${JSON.stringify(generated)}`;
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

    const committedRaw = readFileSync(openApiPath, 'utf8').replace(/^\uFEFF/, '');
    const generatedRaw = readFileSync(generatedPath, 'utf8').replace(/^\uFEFF/, '');

    let committed;
    let generated;
    try {
      committed = JSON.parse(committedRaw);
      generated = JSON.parse(generatedRaw);
    } catch (error) {
      console.error('Failed to parse OpenAPI JSON for comparison:', error);
      process.exit(1);
    }

    if (stableStringify(committed) !== stableStringify(generated)) {
      console.error('OpenAPI schema is out of date. Run `npm run api:openapi` and commit apps/api/openapi.json.');
      const cPaths = Object.keys(committed.paths || {}).sort();
      const gPaths = Object.keys(generated.paths || {}).sort();
      console.error(`committed paths=${cPaths.length} generated paths=${gPaths.length}`);
      const onlyC = cPaths.filter((p) => !gPaths.includes(p));
      const onlyG = gPaths.filter((p) => !cPaths.includes(p));
      if (onlyC.length) {
        console.error(`only committed: ${onlyC.join(', ')}`);
      }
      if (onlyG.length) {
        console.error(`only generated: ${onlyG.join(', ')}`);
      }
      const first = findFirstDiff(committed, generated);
      if (first) {
        console.error(`first diff: ${first}`);
      }
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
