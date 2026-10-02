import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

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

const protectedPaths = ['/admin', '/en/admin', '/de/admin', '/api/readiness', '/v1/readiness'];

async function runSmoke(t, overrides = {}) {
  const visited = [];
  const server = createServer((request, response) => {
    const path = request.url;
    visited.push(path);
    const headers = {
      'cache-control': path === '/' ? 'public, s-maxage=60, stale-while-revalidate=300' : 'private, no-store',
      'content-security-policy-report-only': "default-src 'self'; object-src 'none'"
    };
    let status = 200;
    if (protectedPaths.includes(path)) {
      status = 401;
      headers['www-authenticate'] = 'Basic realm="JetScope admin"';
      headers['x-robots-tag'] = 'noindex, nofollow';
    }
    const override = overrides[path] ?? {};
    Object.assign(headers, override.headers);
    for (const name of Object.keys(headers)) {
      if (headers[name] === null) delete headers[name];
    }
    response.writeHead(override.status ?? status, headers);
    response.end();
  });
  t.after(() => server.close());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/nginx-edge-smoke.mjs', import.meta.url)),
    `http://127.0.0.1:${server.address().port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const [code] = await once(child, 'close');
  return { code, output, visited };
}

test('edge smoke accepts public liveness and anonymous Basic Auth challenges', async (t) => {
  const result = await runSmoke(t);
  assert.equal(result.code, 0, result.output);
  for (const path of ['/api/health', '/v1/health', ...protectedPaths]) {
    assert.ok(result.visited.includes(path), `smoke did not check ${path}`);
  }
});

for (const path of protectedPaths) {
  test(`edge smoke rejects anonymous HTTP 200 at ${path}`, async (t) => {
    const result = await runSmoke(t, { [path]: { status: 200 } });
    assert.equal(result.code, 1);
    assert.ok(result.output.includes(`${path} must reject anonymous requests with HTTP 401`));
  });
}

for (const [name, value, message] of [
  ['www-authenticate', null, 'Basic Auth challenge'],
  ['www-authenticate', 'Bearer', 'Basic Auth challenge'],
  ['cache-control', 'public, max-age=60', 'must not be publicly cached'],
  ['x-robots-tag', null, 'excluded from indexing']
]) {
  test(`edge smoke rejects readiness ${name}: ${value ?? '<missing>'}`, async (t) => {
    const result = await runSmoke(t, { '/v1/readiness': { headers: { [name]: value } } });
    assert.equal(result.code, 1);
    assert.ok(result.output.includes(message), result.output);
  });
}

test('edge smoke rejects a redirect instead of an anonymous challenge', async (t) => {
  const result = await runSmoke(t, { '/api/readiness': { status: 302, headers: { location: '/admin' } } });
  assert.equal(result.code, 1);
  assert.ok(result.output.includes('received 302'), result.output);
});

test('edge smoke rejects protected public liveness', async (t) => {
  const result = await runSmoke(t, { '/v1/health': { status: 401 } });
  assert.equal(result.code, 1);
  assert.ok(result.output.includes('/v1/health public liveness must return HTTP 200'), result.output);
});
