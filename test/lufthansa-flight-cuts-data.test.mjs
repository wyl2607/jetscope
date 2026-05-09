import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const dataRelPath = 'apps/web/app/analysis/lufthansa-flight-cuts-2026-04/data.ts';

async function loadDataModule() {
  const source = await readFile(path.join(repoRoot, dataRelPath), 'utf8');
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-lufthansa-data-'));
  const tempPath = path.join(tempDir, 'data.ts');
  await writeFile(tempPath, source, 'utf8');
  return import(pathToFileURL(tempPath).href);
}

test('data.ts exposes FACTS as a non-empty readonly tuple of strings', async () => {
  const mod = await loadDataModule();
  assert.ok(Array.isArray(mod.FACTS), 'FACTS should be an array');
  assert.ok(mod.FACTS.length >= 3, 'FACTS should have at least 3 entries');
  for (const fact of mod.FACTS) {
    assert.equal(typeof fact, 'string');
    assert.ok(fact.length > 0);
  }
});

test('data.ts exposes BASELINE with crude/carbon/subsidy numeric fields', async () => {
  const { BASELINE } = await loadDataModule();
  assert.equal(typeof BASELINE.crudeUsdPerBarrel, 'number');
  assert.equal(typeof BASELINE.carbonPriceUsdPerTonne, 'number');
  assert.equal(typeof BASELINE.subsidyUsdPerLiter, 'number');
  assert.equal(BASELINE.crudeUsdPerBarrel, 80);
  assert.equal(BASELINE.carbonPriceUsdPerTonne, 90);
  assert.equal(BASELINE.subsidyUsdPerLiter, 0.5);
});

test('data.ts exposes LUFTHANSA_SHOCK_2026Q2 with shock parameters', async () => {
  const { LUFTHANSA_SHOCK_2026Q2 } = await loadDataModule();
  assert.equal(LUFTHANSA_SHOCK_2026Q2.crudeUsdPerBarrel, 115);
  assert.equal(LUFTHANSA_SHOCK_2026Q2.carbonPriceUsdPerTonne, 115);
  assert.equal(LUFTHANSA_SHOCK_2026Q2.subsidyUsdPerLiter, 0.55);
});
