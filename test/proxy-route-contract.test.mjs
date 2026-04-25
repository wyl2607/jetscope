import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const APP_API_DIR = new URL('../apps/web/app/api/', import.meta.url);

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
