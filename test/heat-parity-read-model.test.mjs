import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

async function importReadModel() {
  const source = await readFile(new URL('../apps/web/lib/heat-parity-read-model.ts', import.meta.url), 'utf8');
  const apiConfigUrl = new URL('../apps/web/lib/api-config.ts', import.meta.url).href;
  const rewritten = source.replaceAll("'@/lib/api-config'", `'${apiConfigUrl}'`);
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-heat-read-model-'));
  const tempPath = path.join(tempDir, 'heat-parity-read-model.ts');
  await writeFile(tempPath, rewritten, 'utf8');
  return import(`${pathToFileURL(tempPath).href}?ts=${Date.now()}-${Math.random()}`);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sampleResponse() {
  return {
    generated_at: '2026-06-01T00:00:00Z',
    inputs: {
      carbon_price_eur_per_t: 45,
      elec_price_eur_per_mwh_el: 300,
      gas_price_eur_per_mwh_th: 75
    },
    gas_boiler_reference: {
      name: '燃气冷凝锅炉',
      efficiency: 0.92,
      gas_price_eur_per_mwh_th: 75,
      emission_intensity_t_per_mwh_th: 0.2,
      heat_cost_eur_per_mwh: 91.3
    },
    heat_pump_references: [
      { tech_key: 'air_source', name: '空气源热泵', cop: 3 },
      { tech_key: 'ground_source', name: '地源热泵', cop: 4 }
    ],
    rows: [
      {
        tech_key: 'air_source',
        name: '空气源热泵',
        cop: 3,
        hp_heat_cost_eur_per_mwh: 100,
        gas_heat_cost_eur_per_mwh: 91.3,
        gap_vs_gas_eur_per_mwh: 8.7,
        spread_pct: 9.5,
        breakeven_carbon_price_eur_per_t: 85,
        status: 'inflection'
      }
    ],
    carbon_sweep: [],
    signal: 'close_race'
  };
}

test('label and tone helpers map heat parity statuses and signals', async () => {
  const { heatStatusLabel, heatSignalLabel, heatStatusTone } = await importReadModel();
  assert.equal(heatStatusLabel('dominant'), '热泵占优');
  assert.equal(heatStatusLabel('uneconomic'), '暂不经济');
  assert.equal(heatSignalLabel('clear_leader'), '热泵明确领先');
  assert.match(heatStatusTone('dominant'), /emerald/);
  assert.match(heatStatusTone('uneconomic'), /rose/);
});

test('loadHeatParity hits heat-parity endpoint with carbon and price query', async (t) => {
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

  const { loadHeatParity } = await importReadModel();
  const body = await loadHeatParity({
    carbonPriceEurPerT: 90,
    elecPriceEurPerMwhEl: 280,
    gasPriceEurPerMwhTh: 70
  });
  assert.match(capturedUrl, /\/analysis\/heat-parity\?/);
  assert.match(capturedUrl, /carbon_price=90/);
  assert.match(capturedUrl, /elec_price=280/);
  assert.match(capturedUrl, /gas_price=70/);
  assert.equal(body.rows.length, 1);
  assert.equal(body.signal, 'close_race');
});

test('loadHeatParity uses same-origin proxy in browser runtime', async (t) => {
  const previousWindow = global.window;
  global.window = {};
  const originalFetch = global.fetch;
  let capturedUrl = '';
  global.fetch = async (input) => {
    capturedUrl = String(input);
    return jsonResponse(sampleResponse());
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  });

  const { loadHeatParity } = await importReadModel();
  await loadHeatParity({ carbonPriceEurPerT: 90 });
  assert.match(capturedUrl, /^\/api\/analysis\/heat-parity\?/);
  assert.match(capturedUrl, /carbon_price=90/);
});

test('loadHeatParity throws on non-ok response', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({}, 500);
  t.after(() => {
    global.fetch = originalFetch;
  });
  const { loadHeatParity } = await importReadModel();
  await assert.rejects(() => loadHeatParity({ carbonPriceEurPerT: 10 }), /heat-parity request failed: 500/);
});

function sampleSensitivityResponse() {
  return {
    generated_at: '2026-06-01T00:00:00Z',
    gas_price_eur_per_mwh_th: 75,
    cops: [2.5, 3.0, 3.5, 4.0],
    elec_prices: [240, 300, 360],
    cells: [
      { cop: 3.0, elec_price_eur_per_mwh_el: 300, hp_heat_cost_eur_per_mwh: 100, breakeven_carbon_price_eur_per_t: 85 }
    ],
    disclaimer: 'Personal portfolio project.'
  };
}

test('loadHeatSensitivity hits heat sensitivity endpoint with gas price query', async (t) => {
  const previousBase = process.env.JETSCOPE_API_BASE_URL;
  const previousPrefix = process.env.JETSCOPE_API_PREFIX;
  process.env.JETSCOPE_API_BASE_URL = 'https://api.example.com';
  process.env.JETSCOPE_API_PREFIX = '/v1';
  const originalFetch = global.fetch;
  let capturedUrl = '';
  global.fetch = async (input) => {
    capturedUrl = String(input);
    return jsonResponse(sampleSensitivityResponse());
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (previousBase === undefined) delete process.env.JETSCOPE_API_BASE_URL;
    else process.env.JETSCOPE_API_BASE_URL = previousBase;
    if (previousPrefix === undefined) delete process.env.JETSCOPE_API_PREFIX;
    else process.env.JETSCOPE_API_PREFIX = previousPrefix;
  });

  const { loadHeatSensitivity } = await importReadModel();
  const body = await loadHeatSensitivity({ gasPriceEurPerMwhTh: 70 });
  assert.match(capturedUrl, /\/analysis\/heat-parity\/sensitivity\?/);
  assert.match(capturedUrl, /gas_price=70/);
  assert.equal(body.cells.length, 1);
  assert.equal(body.cops.length, 4);
});

test('loadHeatSensitivity throws on non-ok response', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({}, 500);
  t.after(() => {
    global.fetch = originalFetch;
  });
  const { loadHeatSensitivity } = await importReadModel();
  await assert.rejects(() => loadHeatSensitivity({ gasPriceEurPerMwhTh: 70 }), /heat-sensitivity request failed: 500/);
});
