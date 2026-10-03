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
      if (/admin|api|image|v1/.test(selector)) assert.match(body, /add_header Cache-Control "private, no-store" always;/);
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
for (const failure of [null, 'cached-cookie', 'cached-rsc', 'duplicate-policy', 'unguarded-admin']) {
  test(`post-deploy smoke ${failure ? `rejects ${failure}` : 'passes the expected edge contract'}`, async () => {
    const { createServer } = await import('node:http');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const visited = [];
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const admin = /^\/(?:en\/|de\/)?admin(?:\/|$)/.test(url.pathname);
      const privateRequest = req.method === 'POST' || !safe.includes(url.pathname) ||
        ['cookie', 'authorization', 'x-admin-token', 'rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-url'].some((key) => req.headers[key]) || url.searchParams.has('_rsc');
      visited.push({ path: req.url, method: req.method, headers: req.headers });
      res.statusCode = admin && failure !== 'unguarded-admin' ? 401 : 200;
      if (admin && failure !== 'unguarded-admin') res.setHeader('WWW-Authenticate', 'Basic realm="test"');
      res.setHeader('Cache-Control', privateRequest ? PRIVATE : PUBLIC);
      res.setHeader('Content-Security-Policy-Report-Only', "default-src 'self'; object-src 'none'");
      res.setHeader('Vary', 'RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url');
      if (failure === 'cached-cookie' && req.headers.cookie || failure === 'cached-rsc' && req.headers.rsc) res.setHeader('CF-Cache-Status', 'HIT');
      if (failure === 'duplicate-policy' && !privateRequest) res.setHeader('Cache-Control', [PUBLIC, PRIVATE]);
      res.end('synthetic body');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const run = promisify(execFile)(process.execPath, [new URL('../scripts/nginx-edge-smoke.mjs', import.meta.url).pathname, `http://127.0.0.1:${server.address().port}`]);
      if (failure) {
        await assert.rejects(run, (error) => {
          assert.doesNotMatch(error.stdout, /synthetic body/);
          return /cached response|expected Cache-Control|admin must require Basic Auth/.test(error.stderr);
        });
      } else {
        const { stdout } = await run;
        assert.match(stdout, /nginx edge smoke: 82 passed, 0 failed/);
        assert.ok(visited.some((req) => req.method === 'HEAD'));
        assert.ok(visited.some((req) => req.method === 'POST'));
        assert.equal(visited.filter((req) => req.headers.cookie).length, 2);
        assert.ok(visited.some((req) => req.path.includes('diesel_l=2.75')));
        assert.doesNotMatch(stdout, /synthetic body|edge-smoke-session|Bearer/);
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
