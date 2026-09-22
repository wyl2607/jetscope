#!/usr/bin/env node

const base = process.argv[2];
if (!base) {
  console.error('Usage: node scripts/nginx-edge-smoke.mjs <base-url>');
  process.exit(2);
}

const origin = new URL(base);

async function fetchPath(path) {
  const response = await fetch(new URL(path, `${origin.origin}/`));
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

for (const path of ['/api/health', '/v1/health', '/admin', '/en/admin', '/de/admin', '/_next/image']) {
  const response = await fetchPath(path);
  requireHeader(
    response,
    'cache-control',
    (value) => value.includes('no-store') && !value.includes('public'),
    `${path} must not be publicly cached`
  );
}

console.log('nginx edge smoke: OK');
