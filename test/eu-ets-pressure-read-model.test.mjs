import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

async function importReadModel() {
  const source = await readFile(new URL('../apps/web/lib/eu-ets-pressure-read-model.ts', import.meta.url), 'utf8');
  const apiConfigUrl = new URL('../apps/web/lib/api-config.ts', import.meta.url).href;
  const rewritten = source.replaceAll("'@/lib/api-config'", `'${apiConfigUrl}'`);
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-eu-ets-read-model-'));
  const tempPath = path.join(tempDir, 'eu-ets-pressure-read-model.ts');
  await writeFile(tempPath, rewritten, 'utf8');
  return import(`${pathToFileURL(tempPath).href}?ts=${Date.now()}-${Math.random()}`);
}

function sampleResponse() {
  return {
    generated_at: '2026-06-01T00:00:00Z',
    inputs: { fossil_jet_usd_per_l: 1.0, exempt_blend_pct: 0, eu_ets_min: 0, eu_ets_max: 100, eu_ets_step: 50 },
    points: [
      { eu_ets_eur_per_t: 0, carbon_cost_usd_per_l: 0, effective_fossil_jet_usd_per_l: 1.0, pressure_pct: 0 },
      { eu_ets_eur_per_t: 50, carbon_cost_usd_per_l: 0.135, effective_fossil_jet_usd_per_l: 1.135, pressure_pct: 13.5 },
      { eu_ets_eur_per_t: 100, carbon_cost_usd_per_l: 0.27, effective_fossil_jet_usd_per_l: 1.27, pressure_pct: 27 }
    ],
    source: { source_type: 'derived', confidence_score: 0.7, cadence: 'quarterly', updated_at: '2026-04-23', fallback_used: false },
    signal: 'high'
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('mapPressureToView computes peak pressure and label', async () => {
  const { mapPressureToView } = await importReadModel();
  const vm = mapPressureToView(sampleResponse());
  assert.equal(vm.signal, 'high');
  assert.equal(vm.signalLabel, '高压力');
  assert.equal(vm.peakPressurePct, 27);
  assert.equal(vm.points.length, 3);
  assert.equal(vm.source.source_type, 'derived');
});

test('signalLabel maps all levels', async () => {
  const { signalLabel } = await importReadModel();
  assert.equal(signalLabel('low'), '低压力');
  assert.equal(signalLabel('severe'), '严峻压力');
});

test('loadEuEtsPressure calls the endpoint with query params', async (t) => {
  const prevBase = process.env.JETSCOPE_API_BASE_URL;
  const prevPrefix = process.env.JETSCOPE_API_PREFIX;
  process.env.JETSCOPE_API_BASE_URL = 'https://api.example.com';
  process.env.JETSCOPE_API_PREFIX = '/v1';
  const originalFetch = global.fetch;
  let capturedUrl = '';
  global.fetch = async (input) => {
    capturedUrl = String(input);
    return jsonResponse(sampleResponse());
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (prevBase === undefined) delete process.env.JETSCOPE_API_BASE_URL;
    else process.env.JETSCOPE_API_BASE_URL = prevBase;
    if (prevPrefix === undefined) delete process.env.JETSCOPE_API_PREFIX;
    else process.env.JETSCOPE_API_PREFIX = prevPrefix;
  });

  const { loadEuEtsPressure } = await importReadModel();
  const vm = await loadEuEtsPressure({ fossilJetUsdPerL: 1.0, euEtsMax: 100 });
  assert.match(capturedUrl, /\/policies\/eu-ets-pressure\?/);
  assert.match(capturedUrl, /fossil_jet_usd_per_l=1/);
  assert.equal(vm.peakPressurePct, 27);
});
