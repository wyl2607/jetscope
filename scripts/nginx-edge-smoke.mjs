#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { devNull } from 'node:os';

const base = process.argv[2];
if (!base) {
  console.error('Usage: node scripts/nginx-edge-smoke.mjs <base-url>');
  process.exit(2);
}
const origin = new URL(base);
if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('Provide an HTTP(S) origin without credentials, path, query or fragment');
}
const curl = promisify(execFile);
const PUBLIC = 'public, s-maxage=60, stale-while-revalidate=600';
const PRIVATE = 'private, no-store';
let checks = 0;

async function probe(path, { method = 'GET', headers = {}, publicPage = false, admin = false, redirect = false } = {}) {
  const args = ['--silent', '--show-error', '--max-time', '30', '--dump-header', '-', '--output', devNull];
  if (method === 'HEAD') args.push('--head');
  else args.push('--request', method);
  for (const [name, value] of Object.entries(headers)) args.push('--header', `${name}: ${value}`);
  // No redirect following: a redirect to a public page must not hide a failed bypass.
  args.push(new URL(path, origin).href);
  let stdout;
  try {
    ({ stdout } = await curl('curl', args, { maxBuffer: 128 * 1024 }));
  } catch {
    throw new Error(`curl failed for ${method} ${path}`);
  }
  const block = stdout.trim().split(/\r?\n\r?\n/).filter((part) => part.startsWith('HTTP/')).at(-1);
  const lines = (block || '').split(/\r?\n/);
  const status = Number(lines.shift()?.match(/^HTTP\/\S+ (\d+)/)?.[1]);
  const responseHeaders = new Map();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).toLowerCase();
    responseHeaders.set(key, [...(responseHeaders.get(key) || []), line.slice(colon + 1).trim()]);
  }
  const value = (key) => (responseHeaders.get(key) || []).join(', ');
  const fail = (message) => { throw new Error(`${method} ${path}: ${message}`); };
  if (!status || status >= 500) fail(`HTTP ${status || '<missing>'}`);
  if (publicPage && status !== 200) fail(`expected HTTP 200, received ${status}`);
  if (admin && (status !== 401 || !value('www-authenticate').includes('Basic'))) fail('admin must require Basic Auth');
  const expected = publicPage ? PUBLIC : PRIVATE;
  if (value('cache-control') !== expected) fail(`expected Cache-Control: ${expected}; received ${value('cache-control') || '<missing>'}`);
  if (!publicPage && /^(?:HIT|STALE|UPDATING|REVALIDATED)$/i.test(value('cf-cache-status'))) fail('bypass request received a CDN cached response');
  if (!publicPage && Number(value('age')) > 0) fail('bypass request received Age > 0');
  if (publicPage && value('set-cookie')) fail('public response carries Set-Cookie');
  if (!value('content-security-policy-report-only').includes("default-src 'self'")) fail('missing CSP Report-Only');
  // Cloudflare consumes this header; direct nginx requests must expose it.
  const cfPolicy = value('cloudflare-cdn-cache-control');
  if (cfPolicy && cfPolicy !== (publicPage ? 'public, max-age=60, stale-while-revalidate=600' : PRIVATE)) fail('incorrect Cloudflare cache policy');
  if (publicPage) {
    const vary = value('vary').toLowerCase().split(',').map((part) => part.trim());
    for (const key of ['rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-url']) {
      if (!vary.includes(key)) fail(`Vary missing ${key}`);
    }
  }
  if (redirect && ![200, 307, 308].includes(status)) fail(`unexpected RSC HTTP ${status}`);
  checks += 1;
}

const locales = (path) => [path, `/en${path}`, `/de${path}`];
for (const path of [
  '/', '/en', '/de', ...locales('/faq'), ...locales('/crisis'),
  ...locales('/research'), ...locales('/sources'), ...locales('/prices/germany-jet-fuel'),
  ...locales('/reports/tipping-point-analysis'), '/grid', '/heat',
  '/crisis/eu-jet-reserves', '/crisis/saf-tipping-point', '/analysis',
  '/analysis/lufthansa-flight-cuts-2026-04', '/analysis/lufthansa-2026-de',
  '/en/lufthansa-saf-2026', '/de/lufthansa-saf-2026', '/robots.txt', '/sitemap.xml'
]) await probe(path, { publicPage: true });
await probe('/', { method: 'HEAD', publicPage: true });

for (const path of ['dashboard', 'reports', 'scenarios'].flatMap((path) => locales(`/${path}`))) await probe(path);
for (const path of locales('/admin').flatMap((path) => [path, `${path}/settings`])) await probe(path, { admin: true });
for (const path of ['/api', '/api/health', '/v1', '/v1/health', '/_next/image', '/not-an-audited-route']) await probe(path);

// Warm HTML first; bypass must still work against an existing CDN object.
await probe('/', { publicPage: true });
for (const headers of [
  { Cookie: 'edge-smoke-session=one' }, { Cookie: 'edge-smoke-session=two' },
  { Authorization: 'Bearer edge-smoke-invalid' }, { 'X-Admin-Token': 'edge-smoke-invalid' },
  { RSC: '1' }, { 'Next-Router-State-Tree': '%5B%22%22%2C%7B%7D%5D' },
  { 'Next-Router-Prefetch': '1' }, { 'Next-Router-Segment-Prefetch': '/_tree' }, { 'Next-Url': '/' }
]) await probe('/', { headers, redirect: true });
await probe('/?_rsc=edge-smoke', { headers: { RSC: '1' }, redirect: true });
await probe('/?_rsc=edge-smoke');
await probe('/', { method: 'POST' });
// Warm in the reverse order too; RSC must never replace the HTML representation.
await probe('/', { publicPage: true });

for (const path of ['/crisis/saf-tipping-point', ...locales('/prices/germany-jet-fuel'), ...locales('/sources')]) {
  for (const query of ['?diesel_l=1.25&focus=market&filter=observed', '?diesel_l=2.75&focus=research&filter=derived']) {
    await probe(path + query, { publicPage: true });
  }
}
console.log(`nginx edge smoke: ${checks} passed, 0 failed`);
