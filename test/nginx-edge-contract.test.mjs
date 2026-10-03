import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';

const PUBLIC = 'public, s-maxage=60, stale-while-revalidate=600';
const PRIVATE = 'private, no-store';
const locales = (path) => [path, `/en${path}`, `/de${path}`];
const safe = [
  '/', '/en', '/de', ...locales('/faq'), ...locales('/crisis'),
  ...locales('/research'), ...locales('/sources'),
  ...locales('/prices/germany-jet-fuel'), ...locales('/reports/tipping-point-analysis'),
  '/grid', '/heat', '/crisis/eu-jet-reserves', '/crisis/saf-tipping-point',
  '/analysis', '/analysis/lufthansa-flight-cuts-2026-04', '/analysis/lufthansa-2026-de',
  '/en/lufthansa-saf-2026', '/de/lufthansa-saf-2026', '/robots.txt', '/sitemap.xml'
];
const excluded = ['admin', 'dashboard', 'reports', 'scenarios'].flatMap((path) => locales(`/${path}`));

// Evaluate actual nginx maps instead of duplicating their allowlist in JS.
// This does not replace nginx syntax/inheritance validation after deployment.
function mapsFrom(source) {
  const maps = new Map();
  for (const [, input, name, body] of source.matchAll(/map\s+("[^"]*"|\$\w+)\s+\$(\w+)\s*\{([^}]+)\}/g)) {
    const entries = body.trim().split('\n').map((line) => {
      const match = line.trim().match(/^("[^"]*"|\S+)\s+("[^"]*"|\S+);$/);
      assert.ok(match, `unsupported map entry: ${line}`);
      return match.slice(1).map((value) => value.replace(/^"|"$/g, ''));
    });
    maps.set(name, { input: input.replace(/^"|"$/g, ''), entries });
  }
  return maps;
}

function evaluate(maps, name, values) {
  if (!maps.has(name)) return values[name] ?? '';
  const expand = (value) => value.replace(/\$(\w+)/g, (_, key) => evaluate(maps, key, values));
  const { input, entries } = maps.get(name);
  const key = expand(input);
  const exact = entries.find(([pattern]) => pattern !== 'default' && !pattern.startsWith('~') && pattern.toLowerCase() === key.toLowerCase());
  const regex = entries.find(([pattern]) => pattern.startsWith('~') && new RegExp(pattern.slice(pattern.startsWith('~*') ? 2 : 1), pattern.startsWith('~*') ? 'i' : '').test(key));
  return expand((exact ?? regex ?? entries.find(([pattern]) => pattern === 'default'))[1]);
}

function request(path, overrides = {}) {
  const url = new URL(path, 'http://localhost');
  return { uri: url.pathname, args: url.search.slice(1), request_method: 'GET', upstream_status: '200', upstream_http_content_type: 'text/html; charset=utf-8', ...overrides };
}

for (const file of ['infra/nginx.prod.conf', 'infra/server/nginx.conf']) {
  const source = (await readFile(new URL(`../${file}`, import.meta.url), 'utf8')).replace(/^\s*#.*$/gm, '');
  const maps = mapsFrom(source);
  const header = (path, overrides) => evaluate(maps, 'jetscope_html_cache_control', request(path, overrides));

  test(`${file}: safe pages and metadata get exactly 60/600 for GET and HEAD`, () => {
    for (const path of safe) {
      for (const request_method of ['GET', 'HEAD']) assert.equal(header(path, { request_method }), PUBLIC, path);
    }
    for (const path of ['/robots.txt', '/sitemap.xml']) {
      for (const upstream_http_content_type of ['text/plain', 'application/xml; charset=utf-8', 'text/xml']) {
        assert.equal(header(path, { upstream_http_content_type }), PUBLIC);
      }
    }
    assert.equal(evaluate(maps, 'jetscope_cf_cache_control', request('/')), 'public, max-age=60, stale-while-revalidate=600');
  });

  test(`${file}: workspace pages, API paths and unknown routes stay private`, async () => {
    const apiFiles = await readdir(new URL('../apps/web/app/api/', import.meta.url), { recursive: true });
    const apiRoutes = apiFiles.filter((path) => path.replaceAll('\\', '/').endsWith('/route.ts')).map((path) => `/api/${path.replaceAll('\\', '/').replace('/route.ts', '').replace(/\[[^/]+\]/g, 'example')}`);
    assert.equal(apiRoutes.length, 28, 're-audit when API inventory changes');
    for (const path of [...excluded, ...excluded.map((path) => `${path}/settings`), ...apiRoutes, '/api', '/api/new', '/v1', '/v1/health', '/v1/new', '/unknown', '/faq/extra', '/en/grid', '/de/crisis/saf-tipping-point', '/_next/image']) {
      assert.equal(header(path), PRIVATE, path);
    }
  });

  test(`${file}: credentials, Set-Cookie, methods, errors and non-page responses bypass`, () => {
    for (const overrides of [
      { http_cookie: 'session=synthetic' }, { http_authorization: 'Bearer synthetic' },
      { http_x_admin_token: 'synthetic' }, { upstream_http_set_cookie: 'session=synthetic' },
      ...['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((request_method) => ({ request_method })),
      ...['201', '204', '301', '302', '304', '401', '404', '500', '502', '502, 200'].map((upstream_status) => ({ upstream_status })),
      ...['application/json', 'text/x-component', 'application/octet-stream', ''].map((upstream_http_content_type) => ({ upstream_http_content_type }))
    ]) {
      for (const path of safe) assert.equal(header(path, overrides), PRIVATE, `${path}: ${JSON.stringify(overrides)}`);
      assert.equal(evaluate(maps, 'jetscope_cf_cache_control', request('/', overrides)), PRIVATE);
    }
    assert.equal(evaluate(maps, 'jetscope_static_cache_control', request('/_next/static/test.js')), 'public, max-age=31536000, immutable');
    for (const key of ['http_cookie', 'http_authorization', 'http_x_admin_token', 'upstream_http_set_cookie']) {
      assert.equal(evaluate(maps, 'jetscope_static_cache_control', request('/_next/static/test.js', { [key]: 'synthetic' })), PRIVATE);
    }
  });

  test(`${file}: full queries are forwarded; RSC/router variants bypass even without _rsc`, () => {
    for (const path of ['/crisis/saf-tipping-point', ...locales('/prices/germany-jet-fuel'), ...locales('/sources')]) {
      for (const query of ['?focus=market&filter=observed', '?diesel_l=1.5&diesel_l=2&ev_kwh=0.4', '?unknown=value']) assert.equal(header(path + query), PUBLIC);
      for (const query of ['?_rsc=abc', '?focus=market&_rsc=abc', '?_rsc', '?_rsc=&filter=x']) assert.equal(header(path + query), PRIVATE);
      for (const key of ['http_rsc', 'http_next_router_state_tree', 'http_next_router_prefetch', 'http_next_router_segment_prefetch', 'http_next_url']) assert.equal(header(path, { [key]: '1' }), PRIVATE, key);
    }
    const catchAll = source.match(/location \/ \{([^}]+)\}/)[1];
    assert.doesNotMatch(catchAll, /rewrite|proxy_cache|proxy_pass[^;]*\$(?:uri|args)/);
    assert.match(catchAll, /add_header Vary \$jetscope_edge_vary always;/);
    const vary = evaluate(maps, 'jetscope_edge_vary', { upstream_http_vary: 'Accept-Encoding, X-Custom' });
    for (const name of ['Accept-Encoding', 'X-Custom', 'RSC', 'Next-Router-State-Tree', 'Next-Router-Prefetch', 'Next-Router-Segment-Prefetch', 'Next-Url']) assert.ok(vary.includes(name));
    assert.ok(evaluate(maps, 'jetscope_edge_vary', { upstream_http_vary: '*' }).includes('*'));
  });

  test(`${file}: origin cache headers are replaced and security headers survive`, () => {
    const catchAll = source.match(/location \/ \{([^}]+)\}/)[1];
    const server = source.slice(source.indexOf('proxy_hide_header Cache-Control'), source.indexOf('proxy_hide_header Cache-Control') + 250);
    for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control', 'Surrogate-Control']) {
      assert.ok(server.includes(`proxy_hide_header ${header};`), `server: ${header}`);
      assert.ok(catchAll.includes(`proxy_hide_header ${header};`), `catch-all: ${header}`);
    }
    for (const [, selector, body] of source.matchAll(/location\s+([^\{]+)\{([^}]+)\}/g)) {
      for (const header of ['Content-Security-Policy-Report-Only', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']) assert.ok(body.includes(header));
      assert.match(body, /add_header Cloudflare-CDN-Cache-Control .* always;/);
      if (/admin|api|image|v1/.test(selector)) {
        assert.match(body, /add_header Cache-Control "private, no-store" always;/);
        assert.match(body, /add_header Cloudflare-CDN-Cache-Control "private, no-store" always;/);
      }
      if (/admin|readiness/.test(selector)) {
        assert.match(body, /auth_basic "JetScope admin";/);
        assert.match(body, /auth_basic_user_file [^;]+;/);
        assert.match(body, /add_header X-Robots-Tag "noindex, nofollow" always;/);
      }
      // A local proxy_hide_header list replaces the server list in nginx.
      if (body.includes('proxy_hide_header')) {
        for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control', 'Surrogate-Control']) {
          assert.ok(body.includes(`proxy_hide_header ${header};`), `${selector}: ${header}`);
        }
      }
    }
  });
}

test('every current page is explicitly classified, with no invented locale routes', async () => {
  const files = await readdir(new URL('../apps/web/app/', import.meta.url), { recursive: true });
  const pages = files.filter((path) => path.replaceAll('\\', '/').endsWith('page.tsx')).map((path) => `/${path.replaceAll('\\', '/').replace(/\/?page\.tsx$/, '')}`);
  assert.deepEqual(pages.sort(), [...safe.filter((path) => !['/robots.txt', '/sitemap.xml'].includes(path)), ...excluded].sort());
});

test('host and container use identical edge maps', async () => {
  const [host, prod] = await Promise.all(['server/nginx.conf', 'nginx.prod.conf'].map((file) => readFile(new URL(`../infra/${file}`, import.meta.url), 'utf8')));
  assert.deepEqual([...mapsFrom(host)], [...mapsFrom(prod)]);
});

// Run the real curl-based smoke script against a synthetic local edge, so CI
// exercises status handling and warmed-cache bypass checks without production.
const protectedPaths = ['/admin', '/en/admin', '/de/admin', '/api/readiness', '/v1/readiness'];
async function runSmoke(overrides = {}, failure = null) {
  const { createServer } = await import('node:http');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const visited = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const protectedPath = /^\/(?:en\/|de\/)?admin(?:\/|$)/.test(url.pathname) ||
      /^\/(?:api|v1)\/readiness(?:\/|$)/.test(url.pathname);
    const privateRequest = req.method === 'POST' || !safe.includes(url.pathname) ||
      ['cookie', 'authorization', 'x-admin-token', 'rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-url'].some((key) => req.headers[key]) || url.searchParams.has('_rsc');
    visited.push({ path: req.url, method: req.method, headers: req.headers });
    const headers = {
      'cache-control': privateRequest ? PRIVATE : PUBLIC,
      'cloudflare-cdn-cache-control': privateRequest ? PRIVATE : 'public, max-age=60, stale-while-revalidate=600',
      'content-security-policy-report-only': "default-src 'self'; object-src 'none'",
      vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url'
    };
    if (protectedPath) {
      headers['www-authenticate'] = 'Basic realm="test"';
      headers['x-robots-tag'] = 'noindex, nofollow';
    }
    if (failure === 'cached-cookie' && req.headers.cookie || failure === 'cached-rsc' && req.headers.rsc) headers['cf-cache-status'] = 'HIT';
    if (failure === 'duplicate-policy' && !privateRequest) headers['cache-control'] = [PUBLIC, PRIVATE];
    const override = overrides[url.pathname] ?? {};
    Object.assign(headers, override.headers);
    for (const name of Object.keys(headers)) if (headers[name] === null) delete headers[name];
    res.writeHead(override.status ?? (protectedPath ? 401 : 200), headers);
    res.end('synthetic body');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    try {
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [new URL('../scripts/nginx-edge-smoke.mjs', import.meta.url).pathname, `http://127.0.0.1:${server.address().port}`]);
      return { code: 0, output: stdout + stderr, visited };
    } catch (error) {
      return { code: error.code, output: error.stdout + error.stderr, visited };
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('post-deploy smoke passes the expected edge contract and checks public liveness and anonymous gates', async () => {
  const result = await runSmoke();
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /nginx edge smoke: 84 passed, 0 failed/);
  for (const path of ['/api/health', '/v1/health', ...protectedPaths]) {
    assert.ok(result.visited.some((req) => req.path === path), `smoke did not check ${path}`);
  }
  assert.ok(result.visited.some((req) => req.method === 'HEAD'));
  assert.ok(result.visited.some((req) => req.method === 'POST'));
  assert.equal(result.visited.filter((req) => req.headers.cookie).length, 2);
  assert.ok(result.visited.some((req) => req.path.includes('diesel_l=2.75')));
  assert.doesNotMatch(result.output, /synthetic body|edge-smoke-session|Bearer/);
});

for (const failure of ['cached-cookie', 'cached-rsc', 'duplicate-policy']) {
  test(`post-deploy smoke rejects ${failure}`, async () => {
    const result = await runSmoke({}, failure);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /cached response|expected Cache-Control/);
    assert.doesNotMatch(result.output, /synthetic body/);
  });
}

for (const path of protectedPaths) {
  for (const [name, override, message] of [
    ['anonymous HTTP 200', { status: 200 }, 'must reject anonymous requests with HTTP 401'],
    ['missing challenge', { headers: { 'www-authenticate': null } }, 'Basic Auth challenge'],
    ['Bearer challenge', { headers: { 'www-authenticate': 'Bearer' } }, 'Basic Auth challenge'],
    ['public cache', { headers: { 'cache-control': 'public, max-age=60' } }, 'expected Cache-Control: private, no-store'],
    ['public CDN cache', { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=60' } }, 'incorrect Cloudflare cache policy'],
    ['missing robots tag', { headers: { 'x-robots-tag': null } }, 'excluded from indexing'],
    ['incomplete robots tag', { headers: { 'x-robots-tag': 'noindex' } }, 'excluded from indexing'],
    ['302 redirect', { status: 302, headers: { location: '/' } }, 'received 302']
  ]) {
    test(`edge smoke rejects ${name} at ${path}`, async () => {
      const result = await runSmoke({ [path]: override });
      assert.equal(result.code, 1, result.output);
      assert.ok(result.output.includes(message), result.output);
      assert.ok(result.output.includes(path), result.output);
      assert.doesNotMatch(result.output, /synthetic body/);
    });
  }
}

for (const path of ['/api/health', '/v1/health']) {
  test(`edge smoke rejects protected public liveness at ${path}`, async () => {
    const result = await runSmoke({ [path]: { status: 401 } });
    assert.equal(result.code, 1, result.output);
    assert.ok(result.output.includes(`${path}: public liveness must return HTTP 200`), result.output);
  });
}
