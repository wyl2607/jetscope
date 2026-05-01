import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const APP_API_DIR = new URL('../apps/web/app/api/', import.meta.url);
const LUFTHANSA_DE_PAGE = new URL('../apps/web/app/de/lufthansa-saf-2026/client-market-data.tsx', import.meta.url);

const PROXY_ROUTES = [
  ['market/route.ts', "proxyToApi(request, '/market/snapshot')"],
  ['reserves/route.ts', "proxyToApi(request, '/reserves/eu')"],
  ['reserves/eu/route.ts', "proxyToApi(request, '/reserves/eu')"],
  ['sources/route.ts', "proxyToApi(request, '/sources/coverage')"],
  ['analysis/tipping-point/route.ts', "proxyToApi(request, '/analysis/tipping-point')"],
  ['analysis/airline-decision/route.ts', "proxyToApi(request, '/analysis/airline-decision')"]
];

test('web API proxy routes map to concrete FastAPI endpoints', async () => {
  for (const [relativePath, expectedProxyCall] of PROXY_ROUTES) {
    const source = await readFile(new URL(relativePath, APP_API_DIR), 'utf8');

    assert.ok(
      source.includes(expectedProxyCall),
      `${relativePath} should include ${expectedProxyCall}`
    );
  }
});

test('German Lufthansa page uses source coverage instead of legacy snapshot source_details', async () => {
  const source = await readFile(LUFTHANSA_DE_PAGE, 'utf8');

  assert.ok(
    source.includes("fetch('/api/sources')"),
    'Lufthansa DE market cards should read canonical source coverage'
  );
  assert.match(
    source,
    /setData\(marketSnapshot\);\s*setLoading\(false\);\s*fetch\('\/api\/sources'\)/s,
    'Lufthansa DE market values should render before source coverage finishes'
  );
  assert.ok(
    source.includes('SourceCoverageMetric'),
    'Lufthansa DE market cards should type provenance details with SourceCoverageMetric'
  );
  assert.doesNotMatch(
    source,
    /\bsource_details\b/,
    'Lufthansa DE market cards must not depend on market_snapshot.source_details'
  );
});
