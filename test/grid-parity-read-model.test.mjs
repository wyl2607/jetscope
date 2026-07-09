import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

async function importReadModel() {
  const source = await readFile(new URL('../apps/web/lib/grid-parity-read-model.ts', import.meta.url), 'utf8');
  const apiConfigUrl = new URL('../apps/web/lib/api-config.ts', import.meta.url).href;
  const rewritten = source.replaceAll("'@/lib/api-config'", `'${apiConfigUrl}'`);
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-grid-read-model-'));
  const tempPath = path.join(tempDir, 'grid-parity-read-model.ts');
  await writeFile(tempPath, rewritten, 'utf8');
  return import(`${pathToFileURL(tempPath).href}?ts=${Date.now()}-${Math.random()}`);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sampleResponse() {
  return {
    generated_at: '2026-06-01T00:00:00Z',
    inputs: { carbon_price_eur_per_t: 65, gas_fuel_eur_per_mwh_th: 30, coal_fuel_eur_per_mwh_th: 12, fossil_reference_key: 'gas_ccgt' },
    fossil_reference: {
      plant_key: 'gas_ccgt',
      name: 'Gas CCGT',
      efficiency: 0.55,
      fuel_cost_eur_per_mwh_th: 30,
      var_o_m_eur_per_mwh: 4,
      emission_intensity_t_per_mwh: 0.35,
      marginal_cost_eur_per_mwh: 81.3
    },
    rows: [
      { tech_key: 'solar_pv', name: 'Solar PV (utility)', lcoe_mid_eur_per_mwh: 55, maturity_level: 'commercial', gap_vs_fossil_eur_per_mwh: -26.3, spread_pct: -32.3, status: 'dominant' }
    ],
    carbon_sweep: [],
    signal: 'clear_leader'
  };
}

function sampleLcoeSensitivityResponse() {
  return {
    generated_at: '2026-06-01T00:00:00Z',
    tech_key: 'solar_pv',
    tech_name: 'Solar PV (utility)',
    fossil_reference_key: 'gas_ccgt',
    discount_rates: [0.03, 0.05, 0.07, 0.09],
    full_load_hours: [800, 1000, 1200],
    cells: [
      {
        discount_rate: 0.05,
        full_load_hours: 1000,
        lcoe_eur_per_mwh: 57.5,
        breakeven_carbon_price_eur_per_t: 0
      }
    ],
    disclaimer: 'Illustrative public ranges.'
  };
}

function sampleHistoryResponse() {
  return {
    generated_at: '2026-06-01T00:00:00Z',
    region: 'EU',
    disclaimer: 'Illustrative public history.',
    points: [
      {
        year: 2024,
        carbon_price_eur_per_t: 65,
        fossil_marginal_cost_eur_per_mwh: 83,
        solar_lcoe_eur_per_mwh: 56,
        solar_gap_eur_per_mwh: -27,
        status: 'dominant',
        source: 'grid_baseline_ember_ise',
        confidence: 0.72,
        fallback: false
      }
    ]
  };
}

test('label and tone helpers map statuses and signals', async () => {
  const { gridStatusLabel, gridSignalLabel, gridStatusTone } = await importReadModel();
  assert.equal(gridStatusLabel('dominant'), '清洁占优');
  assert.equal(gridStatusLabel('uneconomic'), '不经济');
  assert.equal(gridSignalLabel('clear_leader'), '清洁能源明确领先');
  assert.match(gridStatusTone('dominant'), /emerald/);
  assert.match(gridStatusTone('uneconomic'), /rose/);
});

test('loadGridParity hits grid-parity endpoint with carbon price query', async (t) => {
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

  const { loadGridParity } = await importReadModel();
  const body = await loadGridParity({ carbonPriceEurPerT: 90 });
  assert.match(capturedUrl, /\/analysis\/grid-parity\?/);
  assert.match(capturedUrl, /carbon_price_eur_per_t=90/);
  assert.equal(body.rows.length, 1);
  assert.equal(body.signal, 'clear_leader');
});

test('loadGridParity uses same-origin proxy in browser runtime', async (t) => {
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

  const { loadGridParity } = await importReadModel();
  await loadGridParity({ carbonPriceEurPerT: 90 });
  assert.match(capturedUrl, /^\/api\/analysis\/grid-parity\?/);
  assert.match(capturedUrl, /carbon_price_eur_per_t=90/);
});

test('loadGridParity throws on non-ok response', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({}, 500);
  t.after(() => {
    global.fetch = originalFetch;
  });
  const { loadGridParity } = await importReadModel();
  await assert.rejects(() => loadGridParity({ carbonPriceEurPerT: 10 }), /grid-parity request failed: 500/);
});

test('loadGridHistory uses same-origin proxy in browser runtime', async (t) => {
  const previousWindow = global.window;
  global.window = {};
  const originalFetch = global.fetch;
  let capturedUrl = '';
  global.fetch = async (input) => {
    capturedUrl = String(input);
    return jsonResponse(sampleHistoryResponse());
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  });

  const { loadGridHistory } = await importReadModel();
  const body = await loadGridHistory();
  assert.equal(capturedUrl, '/api/analysis/grid-parity/history');
  assert.equal(body.points.length, 1);
});

test('loadGridLcoeSensitivity hits lcoe-sensitivity endpoint and parses cells', async (t) => {
  const previousBase = process.env.JETSCOPE_API_BASE_URL;
  const previousPrefix = process.env.JETSCOPE_API_PREFIX;
  process.env.JETSCOPE_API_BASE_URL = 'https://api.example.com';
  process.env.JETSCOPE_API_PREFIX = '/v1';
  const originalFetch = global.fetch;
  let capturedUrl = '';
  global.fetch = async (input) => {
    capturedUrl = String(input);
    return jsonResponse(sampleLcoeSensitivityResponse());
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (previousBase === undefined) delete process.env.JETSCOPE_API_BASE_URL;
    else process.env.JETSCOPE_API_BASE_URL = previousBase;
    if (previousPrefix === undefined) delete process.env.JETSCOPE_API_PREFIX;
    else process.env.JETSCOPE_API_PREFIX = previousPrefix;
  });

  const { loadGridLcoeSensitivity } = await importReadModel();
  const body = await loadGridLcoeSensitivity({ techKey: 'solar_pv', fossilReferenceKey: 'gas_ccgt' });
  assert.match(capturedUrl, /\/analysis\/grid-parity\/lcoe-sensitivity\?/);
  assert.match(capturedUrl, /tech_key=solar_pv/);
  assert.match(capturedUrl, /fossil_reference_key=gas_ccgt/);
  assert.equal(body.cells.length, 1);
  assert.equal(body.cells[0].discount_rate, 0.05);
  assert.equal(body.cells[0].full_load_hours, 1000);
});

test('loadGridLcoeSensitivity uses same-origin proxy in browser runtime', async (t) => {
  const previousWindow = global.window;
  global.window = {};
  const originalFetch = global.fetch;
  let capturedUrl = '';
  global.fetch = async (input) => {
    capturedUrl = String(input);
    return jsonResponse(sampleLcoeSensitivityResponse());
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  });

  const { loadGridLcoeSensitivity } = await importReadModel();
  await loadGridLcoeSensitivity({ techKey: 'onshore_wind' });
  assert.match(capturedUrl, /^\/api\/analysis\/grid-parity\/lcoe-sensitivity\?/);
  assert.match(capturedUrl, /tech_key=onshore_wind/);
});

test('loadGridLcoeSensitivity throws on non-ok response', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({}, 404);
  t.after(() => {
    global.fetch = originalFetch;
  });
  const { loadGridLcoeSensitivity } = await importReadModel();
  await assert.rejects(() => loadGridLcoeSensitivity({ techKey: 'unknown' }), /lcoe-sensitivity request failed: 404/);
});
