import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

async function importReadModel() {
  const source = await readFile(new URL('../apps/web/lib/transition-read-model.ts', import.meta.url), 'utf8');
  const apiConfigUrl = new URL('../apps/web/lib/api-config.ts', import.meta.url).href;
  const rewritten = source.replaceAll("'@/lib/api-config'", `'${apiConfigUrl}'`);
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-transition-read-model-'));
  const tempPath = path.join(tempDir, 'transition-read-model.ts');
  await writeFile(tempPath, rewritten, 'utf8');
  return import(`${pathToFileURL(tempPath).href}?ts=${Date.now()}-${Math.random()}`);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sampleResponse() {
  return {
    generated_at: '2026-06-01T00:00:00Z',
    disclaimer: 'Personal portfolio project.',
    domains: [
      {
        domain_key: 'grid',
        domain_name: '电网新能源',
        carbon_driver: 'EU ETS',
        reference_carbon_price_eur_per_t: 65,
        techs: [
          { tech_key: 'solar_pv', name: 'Solar PV (utility)', breakeven_carbon_price_eur_per_t: 0, competitive_at_reference: true }
        ]
      }
    ]
  };
}

test('loadTransitionSummary hits transition-summary endpoint', async (t) => {
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

  const { loadTransitionSummary } = await importReadModel();
  const body = await loadTransitionSummary();
  assert.match(capturedUrl, /\/analysis\/transition-summary$/);
  assert.equal(body.domains.length, 1);
  assert.equal(body.domains[0].techs[0].competitive_at_reference, true);
});

test('loadTransitionSummary throws on non-ok response', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({}, 500);
  t.after(() => {
    global.fetch = originalFetch;
  });
  const { loadTransitionSummary } = await importReadModel();
  await assert.rejects(() => loadTransitionSummary(), /transition-summary request failed: 500/);
});
