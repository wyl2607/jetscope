import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Edge security headers + public-page cache policy (issue #322).
//
// nginx `add_header` replaces rather than merges: any location that sets one
// header must restate the full security set, or HSTS and friends silently
// disappear. These tests parse location blocks the same way as
// test/nginx-admin-auth-contract.test.mjs.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SECURITY_HEADERS = [
  { name: 'Strict-Transport-Security', pattern: /add_header\s+Strict-Transport-Security\s+"max-age=31536000"\s+always\s*;/ },
  { name: 'X-Content-Type-Options', pattern: /add_header\s+X-Content-Type-Options\s+"nosniff"\s+always\s*;/ },
  { name: 'X-Frame-Options', pattern: /add_header\s+X-Frame-Options\s+"SAMEORIGIN"\s+always\s*;/ },
  { name: 'Referrer-Policy', pattern: /add_header\s+Referrer-Policy\s+"strict-origin-when-cross-origin"\s+always\s*;/ },
  { name: 'Permissions-Policy', pattern: /add_header\s+Permissions-Policy\s+"camera=\(\),\s*microphone=\(\),\s*geolocation=\(\)"\s+always\s*;/ }
];

const PUBLIC_CACHE = /add_header\s+Cache-Control\s+"public,\s*max-age=0,\s*s-maxage=60,\s*stale-while-revalidate=300"\s+always\s*;/;
const NO_STORE = /add_header\s+Cache-Control\s+"private,\s*no-store"\s+always\s*;/;
const IMMUTABLE_STATIC = /add_header\s+Cache-Control\s+"public,\s*max-age=31536000,\s*immutable"\s+always\s*;/;

/**
 * Split an nginx conf into top-level `location ... { ... }` blocks.
 * Only match at line start so comments that mention the word "location"
 * (common in these files) are not treated as directives. Nested braces
 * inside a location are rare; unbalanced blocks are skipped.
 */
function locationBlocks(conf) {
  const blocks = [];
  const re = /^\s*location\s+([^{]+)\{/gm;
  let match;
  while ((match = re.exec(conf)) !== null) {
    const selector = match[1].trim();
    let depth = 1;
    let i = re.lastIndex;
    const start = match.index;
    while (i < conf.length && depth > 0) {
      const ch = conf[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    if (depth === 0) {
      blocks.push({ selector, body: conf.slice(start, i) });
    }
  }
  return blocks;
}

function locationPath(selector) {
  const parts = selector.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function hasAnyAddHeader(body) {
  return /\badd_header\b/.test(body);
}

function assertFullSecuritySet(body, label) {
  for (const header of SECURITY_HEADERS) {
    assert.match(
      body,
      header.pattern,
      `${label}: missing security header ${header.name} (add_header does not inherit)`
    );
  }
}

function collectSecurityHeaderValues(body) {
  const values = {};
  for (const header of SECURITY_HEADERS) {
    const re = new RegExp(
      `add_header\\s+${header.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+"([^"]+)"\\s+always\\s*;`
    );
    const m = body.match(re);
    values[header.name] = m ? m[1] : null;
  }
  return values;
}

function isNoStorePath(pathValue) {
  if (pathValue === '/v1' || pathValue === '/v1/' || pathValue.startsWith('/v1')) return true;
  if (pathValue === '/api' || pathValue === '/api/' || pathValue.startsWith('/api')) return true;
  if (
    pathValue === '/admin' ||
    pathValue === '/admin/' ||
    pathValue === '/de/admin' ||
    pathValue === '/de/admin/' ||
    pathValue === '/en/admin' ||
    pathValue === '/en/admin/'
  ) {
    return true;
  }
  return false;
}

function assertCachePolicy(conf, fileLabel) {
  const blocks = locationBlocks(conf);

  for (const block of blocks) {
    if (!hasAnyAddHeader(block.body)) continue;
    assertFullSecuritySet(block.body, `${fileLabel} location ${block.selector}`);
  }

  const byPath = new Map();
  for (const block of blocks) {
    byPath.set(locationPath(block.selector), block);
  }

  // Public catch-all must advertise the short shared-cache window.
  const root = blocks.find((b) => locationPath(b.selector) === '/' && !b.selector.includes('='));
  assert.ok(root, `${fileLabel}: missing location /`);
  assert.match(root.body, PUBLIC_CACHE, `${fileLabel}: location / must set public s-maxage cache policy`);
  assertFullSecuritySet(root.body, `${fileLabel} location /`);

  // Static assets keep the long immutable policy and the security set.
  const staticBlock = byPath.get('/_next/static/');
  assert.ok(staticBlock, `${fileLabel}: missing location /_next/static/`);
  assert.match(
    staticBlock.body,
    IMMUTABLE_STATIC,
    `${fileLabel}: /_next/static/ must keep immutable Cache-Control`
  );
  assertFullSecuritySet(staticBlock.body, `${fileLabel} location /_next/static/`);

  // API, BFF, and admin must not be shared-cacheable.
  for (const block of blocks) {
    const p = locationPath(block.selector);
    if (!isNoStorePath(p)) continue;
    assert.match(
      block.body,
      NO_STORE,
      `${fileLabel}: location ${block.selector} must set private, no-store`
    );
    assert.doesNotMatch(
      block.body,
      /s-maxage\s*=/,
      `${fileLabel}: location ${block.selector} must not set s-maxage`
    );
  }

  // Explicit presence of the non-negotiable exclusions.
  const paths = blocks.map((b) => locationPath(b.selector));
  assert.ok(paths.some((p) => p === '/v1' || p === '/v1/'), `${fileLabel}: expected a /v1 location`);
  assert.ok(paths.some((p) => p === '/api/'), `${fileLabel}: expected location /api/`);
  for (const admin of ['/admin', '/de/admin', '/en/admin']) {
    assert.ok(
      paths.some((p) => p === admin || p === `${admin}/`),
      `${fileLabel}: expected admin location for ${admin}`
    );
  }
}

test('infra/server/nginx.conf restates security headers on every add_header location and sets cache policy', async () => {
  const conf = await readFile(path.join(repoRoot, 'infra/server/nginx.conf'), 'utf8');
  assertCachePolicy(conf, 'infra/server/nginx.conf');
});

test('infra/nginx.prod.conf restates security headers on every add_header location and sets cache policy', async () => {
  const conf = await readFile(path.join(repoRoot, 'infra/nginx.prod.conf'), 'utf8');
  assertCachePolicy(conf, 'infra/nginx.prod.conf');
});

test('host and prod nginx agree on the security header set', async () => {
  const host = await readFile(path.join(repoRoot, 'infra/server/nginx.conf'), 'utf8');
  const prod = await readFile(path.join(repoRoot, 'infra/nginx.prod.conf'), 'utf8');

  // Compare values from the public catch-all, which must carry the full set.
  const hostRoot = locationBlocks(host).find(
    (b) => locationPath(b.selector) === '/' && !b.selector.includes('=')
  );
  const prodRoot = locationBlocks(prod).find(
    (b) => locationPath(b.selector) === '/' && !b.selector.includes('=')
  );
  assert.ok(hostRoot && prodRoot, 'both configs need location /');

  const hostValues = collectSecurityHeaderValues(hostRoot.body);
  const prodValues = collectSecurityHeaderValues(prodRoot.body);
  assert.deepEqual(
    hostValues,
    prodValues,
    'infra/server/nginx.conf and infra/nginx.prod.conf must agree on security header values'
  );

  for (const header of SECURITY_HEADERS) {
    assert.ok(hostValues[header.name], `host missing ${header.name}`);
    assert.ok(prodValues[header.name], `prod missing ${header.name}`);
  }
});

test('Next.js CSP is report-only and not enforcing', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/web/next.config.mjs'), 'utf8');

  assert.match(
    source,
    /key:\s*['"]Content-Security-Policy-Report-Only['"]/,
    'next.config.mjs must set Content-Security-Policy-Report-Only'
  );

  // Fail if a future edit drops -Report-Only and ships an enforcing CSP key.
  const enforcingAssignments = [...source.matchAll(/key:\s*['"]Content-Security-Policy['"]/g)];
  assert.equal(
    enforcingAssignments.length,
    0,
    'next.config.mjs must not assign enforcing Content-Security-Policy (report-only only)'
  );

  // No off-site collector in the live policy value — browser console only.
  // Comments may name report-uri/report-to as forbidden; strip // comments first.
  const codeOnly = source
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  assert.doesNotMatch(codeOnly, /report-uri/i);
  assert.doesNotMatch(codeOnly, /report-to/i);

  // Core directives present in the policy string.
  assert.match(source, /default-src\s+'self'/);
  assert.match(source, /script-src\s+'self'/);
  assert.match(source, /style-src\s+'self'/);
  assert.match(source, /object-src\s+'none'/);
});

test('deploy smoke probes edge headers through nginx, not only :3000', async () => {
  const script = await readFile(path.join(repoRoot, 'scripts/deploy-usa-vps.sh'), 'utf8');
  assert.match(script, /content-security-policy-report-only/i);
  assert.match(script, /s-maxage=60/);
  assert.match(script, /private,\s*no-store|private, no-store/);
  // Through-nginx form from the 8c8a4c4 lesson: --resolve + public Host, not bare :3000.
  assert.match(script, /--resolve/);
  assert.match(script, /Edge header|edge header|header \/ cache|through nginx/i);
});

test('CSP promotion path is documented for maintainers', async () => {
  const security = await readFile(path.join(repoRoot, 'docs/SECURITY_NOTES.md'), 'utf8');
  assert.match(security, /Content-Security-Policy-Report-Only/);
  assert.match(security, /promot/i);
  assert.match(security, /nonce|strict-dynamic/i);
  assert.match(security, /rollback/i);

  const deploy = await readFile(path.join(repoRoot, 'docs/DEPLOY_USA_VPS.md'), 'utf8');
  assert.match(deploy, /s-maxage/);
  assert.match(deploy, /no-store/);
  assert.match(deploy, /\/api\//);
  assert.match(deploy, /add_header/);
});
