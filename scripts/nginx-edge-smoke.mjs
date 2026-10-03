#!/usr/bin/env node

const base = process.argv[2];
if (!base) {
  console.error('Usage: node scripts/nginx-edge-smoke.mjs <base-url>');
  process.exit(2);
}

const origin = new URL(base);

async function fetchPath(path) {
  const response = await fetch(new URL(path, `${origin.origin}/`), { redirect: 'manual' });
  if (response.status >= 500) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response;
}

function requireHeader(response, name, predicate, message) {
  const value = response.headers.get(name) || '';
  if (!predicate(value)) {
    throw new Error(`${message}; received ${name}: ${value || '<missing>'}`);
  }
}

const publicPage = await fetchPath('/');
requireHeader(
  publicPage,
  'content-security-policy-report-only',
  (value) => value.includes("default-src 'self'") && value.includes("object-src 'none'"),
  'public HTML must carry CSP Report-Only'
);
requireHeader(
  publicPage,
  'cache-control',
  (value) => value.includes('s-maxage=60') && value.includes('stale-while-revalidate=300'),
  'anonymous public HTML must carry the short edge-cache policy'
);

const protectedPaths = ['/admin', '/en/admin', '/de/admin', '/api/readiness', '/v1/readiness'];

for (const path of ['/api/health', '/v1/health', '/_next/image', ...protectedPaths]) {
  const response = await fetchPath(path);
  requireHeader(
    response,
    'cache-control',
    (value) => value.includes('private') && value.includes('no-store') && !value.includes('public'),
    `${path} must not be publicly cached`
  );
  if (protectedPaths.includes(path)) {
    if (response.status !== 401) {
      throw new Error(`${path} must reject anonymous requests with HTTP 401; received ${response.status}`);
    }
    requireHeader(response, 'www-authenticate', (value) => /^Basic\s+/i.test(value),
      `${path} must carry a Basic Auth challenge`);
    requireHeader(response, 'x-robots-tag', (value) => value.includes('noindex') && value.includes('nofollow'),
      `${path} must be excluded from indexing`);
  } else if (path.endsWith('/health') && response.status !== 200) {
    throw new Error(`${path} public liveness must return HTTP 200; received ${response.status}`);
  }
}

console.log('nginx edge smoke: OK');
