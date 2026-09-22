import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const PROD = new URL('../infra/nginx.prod.conf', import.meta.url);
const HOST = new URL('../infra/server/nginx.conf', import.meta.url);

test('production edge config defines CSP report-only and explicit cache exclusions', async () => {
  const source = await readFile(PROD, 'utf8');

  assert.match(source, /Content-Security-Policy-Report-Only/);
  assert.match(source, /default-src 'self'/);
  assert.match(source, /s-maxage=60/);
  assert.match(source, /stale-while-revalidate=300/);
  assert.match(source, /location ~ \^\/\(\?:en\/\|de\/\)\?admin/);
  assert.match(source, /location ~ \^\/api/);
  assert.match(source, /location \/_next\/image/);
  assert.match(source, /private, no-store/);
  assert.match(source, /max-age=31536000, immutable/);
  assert.match(source, /upstream_http_set_cookie/);
});

test('host edge config carries the same CSP and cache policy', async () => {
  const source = await readFile(HOST, 'utf8');

  assert.match(source, /Content-Security-Policy-Report-Only/);
  assert.match(source, /s-maxage=60/);
  assert.match(source, /location ~ \^\/\(\?:en\/\|de\/\)\?admin/);
  assert.match(source, /private, no-store/);
});

test('post-deploy smoke is explicit and does not silently probe the wrong host', async () => {
  const source = await readFile(new URL('../scripts/nginx-edge-smoke.mjs', import.meta.url), 'utf8');

  assert.match(source, /process\.argv\[2\]/);
  assert.match(source, /content-security-policy-report-only/);
  assert.match(source, /s-maxage=60/);
  assert.match(source, /no-store/);
});
