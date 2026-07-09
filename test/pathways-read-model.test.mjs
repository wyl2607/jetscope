import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

async function importReadModel() {
  const source = await readFile(new URL('../apps/web/lib/pathways-read-model.ts', import.meta.url), 'utf8');
  const apiConfigUrl = new URL('../apps/web/lib/api-config.ts', import.meta.url).href;
  const rewritten = source.replaceAll("'@/lib/api-config'", `'${apiConfigUrl}'`);
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-pathways-read-model-'));
  const tempPath = path.join(tempDir, 'pathways-read-model.ts');
  await writeFile(tempPath, rewritten, 'utf8');
  return import(`${pathToFileURL(tempPath).href}?ts=${Date.now()}-${Math.random()}`);
}

function sampleResponse() {
  return {
    generated_at: '2026-06-01T00:00:00Z',
    inputs: { fossil_jet_usd_per_l: 1.0, carbon_price_eur_per_t: 0, subsidy_usd_per_l: 0, blend_rate_pct: 0 },
    fossil_jet_usd_per_l: 1.0,
    rows: [
      {
        pathway_key: 'hefa',
        name: 'HEFA',
        min_usd_per_l: 1.0,
        max_usd_per_l: 1.5,
        midpoint_usd_per_l: 1.25,
        carbon_reduction_pct: 70,
        maturity_level: 'commercial',
        effective_saf_cost_usd_per_l: 1.25,
        gap_vs_fossil_usd_per_l: 0.25,
        spread_pct: 25,
        status: 'inflection',
        source: { source_type: 'manual', confidence_score: 0.8, cadence: 'quarterly', updated_at: '2026-04-23', fallback_used: false }
      }
    ],
    carbon_sweep: [],
    signal: 'close_race'
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('mapComparisonToView builds source view and signal label', async () => {
  const { mapComparisonToView } = await importReadModel();
  const vm = mapComparisonToView(sampleResponse());
  assert.equal(vm.signal, 'close_race');
  assert.equal(vm.signalLabel, '势均力敌');
  assert.equal(vm.rows.length, 1);
  const src = vm.sourceByKey.hefa;
  assert.equal(src.sourceType, 'manual');
  assert.equal(src.confidencePct, 80);
  assert.equal(src.confidenceLabel, '高');
  assert.equal(src.fallbackUsed, false);
  assert.match(src.freshnessLabel, /2026-04-23/);
});

test('confidenceLabel thresholds', async () => {
  const { confidenceLabel } = await importReadModel();
  assert.equal(confidenceLabel(0.8), '高');
  assert.equal(confidenceLabel(0.65), '中');
  assert.equal(confidenceLabel(0.4), '低');
});

test('loadPathwayComparison fetches compare endpoint with query params', async (t) => {
  const previousBase = process.env.JETSCOPE_API_BASE_URL;
  const previousPrefix = process.env.JETSCOPE_API_PREFIX;
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
    if (previousBase === undefined) delete process.env.JETSCOPE_API_BASE_URL;
    else process.env.JETSCOPE_API_BASE_URL = previousBase;
    if (previousPrefix === undefined) delete process.env.JETSCOPE_API_PREFIX;
    else process.env.JETSCOPE_API_PREFIX = previousPrefix;
  });

  const { loadPathwayComparison } = await importReadModel();
  const vm = await loadPathwayComparison({ fossilJetUsdPerL: 1.0, carbonPriceEurPerT: 100 });
  assert.match(capturedUrl, /\/pathways\/compare\?/);
  assert.match(capturedUrl, /fossil_jet_usd_per_l=1/);
  assert.match(capturedUrl, /carbon_price_eur_per_t=100/);
  assert.equal(vm.rows.length, 1);
});
