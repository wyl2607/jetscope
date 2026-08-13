import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_API_DIR = new URL('../apps/web/app/api/', import.meta.url);
const LUFTHANSA_DE_PAGE = new URL('../apps/web/app/de/lufthansa-saf-2026/client-market-data.tsx', import.meta.url);
const PROXY_SOURCE = new URL('../apps/web/app/api/_shared/proxy.ts', import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PROXY_ROUTES = [
  ['health/route.ts', "proxyToApi(request, '/health')"],
  ['market/route.ts', "proxyToApi(request, '/market/snapshot')"],
  ['readiness/route.ts', "proxyToApi(request, '/readiness')"],
  ['research/refresh/route.ts', "proxyToApi(request, '/research/refresh')"],
  ['reserves/route.ts', "proxyToApi(request, '/reserves/eu')"],
  ['reserves/eu/route.ts', "proxyToApi(request, '/reserves/eu')"],
  ['sources/route.ts', "proxyToApi(request, '/sources/coverage')"],
  ['analysis/tipping-point/route.ts', "proxyToApi(request, '/analysis/tipping-point')"],
  ['analysis/heat-parity/route.ts', "proxyToApi(request, '/analysis/heat-parity')"],
  ['analysis/heat-parity/sensitivity/route.ts', "proxyToApi(request, '/analysis/heat-parity/sensitivity')"],
  ['analysis/transition-summary/route.ts', "proxyToApi(request, '/analysis/transition-summary')"],
  ['analysis/grid-parity/route.ts', "proxyToApi(request, '/analysis/grid-parity')"],
  ['analysis/grid-parity/history/route.ts', "proxyToApi(request, '/analysis/grid-parity/history')"],
  ['analysis/grid-parity/lcoe-sensitivity/route.ts', "proxyToApi(request, '/analysis/grid-parity/lcoe-sensitivity')"],
  ['analysis/airline-decision/route.ts', "proxyToApi(request, '/analysis/airline-decision')"],
  ['pathways/compare/route.ts', "proxyToApi(request, '/pathways/compare')"],
  ['policies/eu-ets-pressure/route.ts', "proxyToApi(request, '/policies/eu-ets-pressure')"]
];

// Distinctive internal detail that must never appear in a public proxy body.
const INTERNAL_LEAK_MARKER =
  'getaddrinfo ENOTFOUND upstream-secret-host.internal.example:8443 TLS handshake XYZ-LEAK-9f3c';

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

test('shared proxy public error contract is documented in source', async () => {
  const source = await readFile(PROXY_SOURCE, 'utf8');

  assert.match(source, /Upstream API timed out/);
  assert.match(source, /Upstream API unavailable/);
  assert.match(source, /correlationId/);
  // Public JSON must not be built from the raw exception message.
  assert.doesNotMatch(
    source,
    /NextResponse\.json\(\s*\{\s*error:\s*(?:error\.message|message)\s*\}/
  );
  assert.ok(
    !source.includes('? error.message'),
    'catch branch must not put error.message into the public response'
  );
});

/**
 * Load proxyToApi with a stub next/server and api-config so Node can exercise
 * the catch branch without the full Next runtime.
 */
async function loadProxyWithFetch(fetchImpl) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-proxy-'));
  const nextServerPath = path.join(tempDir, 'next-server.mjs');
  const apiConfigPath = path.join(tempDir, 'api-config.mjs');
  const proxyPath = path.join(tempDir, 'proxy.ts');

  await writeFile(
    nextServerPath,
    `
export class NextResponse {
  constructor(body, init = {}) {
    this._body = body;
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? '';
    this.headers = init.headers ?? new Headers();
  }

  static json(body, init = {}) {
    const res = new NextResponse(JSON.stringify(body), init);
    res._json = body;
    res.headers = new Headers(init.headers ?? {});
    res.headers.set('content-type', 'application/json');
    return res;
  }

  async json() {
    if (this._json !== undefined) return this._json;
    return JSON.parse(String(this._body));
  }

  async text() {
    if (this._json !== undefined) return JSON.stringify(this._json);
    return String(this._body);
  }
}
`,
    'utf8'
  );

  await writeFile(
    apiConfigPath,
    `
export function buildApiUrl(apiPath) {
  return 'http://upstream-secret-host.internal.example:8443/v1' + apiPath;
}
`,
    'utf8'
  );

  let source = await readFile(PROXY_SOURCE, 'utf8');
  source = source
    .replaceAll("from 'next/server'", `from ${JSON.stringify(pathToFileURL(nextServerPath).href)}`)
    .replaceAll("from '@/lib/api-config'", `from ${JSON.stringify(pathToFileURL(apiConfigPath).href)}`);

  await writeFile(proxyPath, source, 'utf8');

  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;

  try {
    const mod = await import(`${pathToFileURL(proxyPath).href}?t=${Date.now()}-${Math.random()}`);
    return {
      proxyToApi: mod.proxyToApi,
      PROXY_TIMEOUT_ERROR: mod.PROXY_TIMEOUT_ERROR,
      PROXY_UNAVAILABLE_ERROR: mod.PROXY_UNAVAILABLE_ERROR,
      restore() {
        globalThis.fetch = previousFetch;
      }
    };
  } catch (error) {
    globalThis.fetch = previousFetch;
    throw error;
  }
}

function makeRequest(url = 'http://localhost:3000/api/health') {
  return new Request(url, { method: 'GET' });
}

test('proxy timeout failures return stable 504 body without internal error text', async () => {
  const loaded = await loadProxyWithFetch(async () => {
    const err = new Error(INTERNAL_LEAK_MARKER);
    err.name = 'AbortError';
    throw err;
  });

  const logs = [];
  const previousError = console.error;
  console.error = (...args) => {
    logs.push(args.map(String).join(' '));
  };

  try {
    const response = await loaded.proxyToApi(makeRequest(), '/health');
    assert.equal(response.status, 504);

    const bodyText = await response.text();
    assert.ok(
      !bodyText.includes(INTERNAL_LEAK_MARKER),
      'timeout response body must not contain the planted internal error string'
    );
    assert.ok(
      !bodyText.includes('upstream-secret-host.internal.example'),
      'timeout response body must not contain the upstream host'
    );

    const body = JSON.parse(bodyText);
    assert.equal(body.error, loaded.PROXY_TIMEOUT_ERROR);
    assert.equal(typeof body.correlationId, 'string');
    assert.match(body.correlationId, /^[0-9a-f-]{36}$/i);
    assert.equal(Object.keys(body).sort().join(','), 'correlationId,error');

    const joinedLogs = logs.join('\n');
    assert.ok(
      joinedLogs.includes(body.correlationId),
      'server log must include the same correlationId as the public body'
    );
    assert.ok(
      joinedLogs.includes(INTERNAL_LEAK_MARKER) || joinedLogs.includes('AbortError'),
      'server log should retain the original failure detail for operators'
    );
  } finally {
    console.error = previousError;
    loaded.restore();
  }
});

test('proxy non-timeout failures return stable 502 body without internal error text', async () => {
  const loaded = await loadProxyWithFetch(async () => {
    throw new Error(INTERNAL_LEAK_MARKER);
  });

  const logs = [];
  const previousError = console.error;
  console.error = (...args) => {
    logs.push(args.map(String).join(' '));
  };

  try {
    const response = await loaded.proxyToApi(makeRequest(), '/market/snapshot');
    assert.equal(response.status, 502);

    const bodyText = await response.text();
    assert.ok(
      !bodyText.includes(INTERNAL_LEAK_MARKER),
      '502 response body must not contain the planted internal error string'
    );
    assert.ok(
      !bodyText.includes('upstream-secret-host.internal.example'),
      '502 response body must not contain the upstream host'
    );
    assert.ok(!bodyText.includes('stack'), '502 response body must not look like a stack dump');

    const body = JSON.parse(bodyText);
    assert.equal(body.error, loaded.PROXY_UNAVAILABLE_ERROR);
    assert.equal(typeof body.correlationId, 'string');
    assert.match(body.correlationId, /^[0-9a-f-]{36}$/i);
    assert.equal(Object.keys(body).sort().join(','), 'correlationId,error');

    const joinedLogs = logs.join('\n');
    assert.ok(
      joinedLogs.includes(body.correlationId),
      'server log must include the same correlationId as the public body'
    );
    assert.ok(
      joinedLogs.includes(INTERNAL_LEAK_MARKER),
      'server log must retain the original exception message for operators'
    );
    assert.ok(
      joinedLogs.includes('/market/snapshot'),
      'server log must include the proxied route'
    );
  } finally {
    console.error = previousError;
    loaded.restore();
  }
});

test('API contract documents the public proxy failure envelope', async () => {
  const contract = await readFile(path.join(repoRoot, 'docs/API_CONTRACT_V1.md'), 'utf8');
  assert.match(contract, /correlationId/);
  assert.match(contract, /Upstream API unavailable/);
  assert.match(contract, /Upstream API timed out/);
  assert.match(contract, /502/);
  assert.match(contract, /504/);
});
