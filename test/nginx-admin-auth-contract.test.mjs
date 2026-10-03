import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Edge Basic Auth protects admin HTML and readiness disclosure. Check the
// selected nginx location as well as coverage: an earlier generic regex must
// not bypass the gate. Static checks only — no live nginx.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_URIS = [
  '/admin',
  '/admin/',
  '/admin/settings',
  '/en/admin',
  '/en/admin/',
  '/en/admin/settings',
  '/de/admin',
  '/de/admin/',
  '/de/admin/settings',
  '/api/readiness',
  '/api/readiness/',
  '/v1/readiness',
  '/v1/readiness/'
];

// A bare `location /admin` prefix matches /administrator. These URIs must not
// be covered by the block that gates the admin UI.
const FORBIDDEN_URIS = [
  '/',
  '/dashboard',
  '/administrator',
  '/en/administrator',
  '/de/administrator',
  '/admin-console',
  '/fr/admin',
  '/api/admin',
  '/en/dashboard',
  '/de/dashboard',
  '/api/health',
  '/v1/health',
  '/api/readiness-status',
  '/v1/readiness-status',
  '/v1/market/refresh'
];

const HOST_HTPASSWD = '/etc/nginx/secrets/jetscope-admin.htpasswd';
const PROD_HTPASSWD = '/etc/nginx/secrets/admin.htpasswd';

function stripNginxComments(conf) {
  return conf
    .split('\n')
    .map((line) => {
      const hash = line.indexOf('#');
      return hash === -1 ? line : line.slice(0, hash);
    })
    .join('\n');
}

function locationBlocks(conf) {
  const source = stripNginxComments(conf);
  const blocks = [];
  const re = /location\s+([^{]+)\{/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const selector = match[1].trim();
    let depth = 1;
    let i = re.lastIndex;
    const start = match.index;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    if (depth === 0) {
      blocks.push({ selector, body: source.slice(start, i) });
    }
  }
  return blocks;
}

// Prefix locations match by string prefix, so `location /admin` covers
// `/administrator`. Exact `=` and regex `~` follow nginx's other two forms.
function compileSelector(selector) {
  const trimmed = selector.trim();
  if (trimmed.startsWith('~')) {
    const caseInsensitive = trimmed.startsWith('~*');
    const pattern = trimmed.slice(caseInsensitive ? 2 : 1).trim().replace(/^["']|["']$/g, '');
    return { kind: 'regex', re: new RegExp(pattern, caseInsensitive ? 'i' : '') };
  }
  const parts = trimmed.split(/\s+/);
  if (parts[0] === '=' && parts.length === 2) {
    return { kind: 'exact', path: parts[1] };
  }
  if (parts[0] === '^~' && parts.length === 2) {
    return { kind: 'prefix', path: parts[1], stopRegex: true };
  }
  if (parts.length === 1) {
    return { kind: 'prefix', path: parts[0] };
  }
  throw new Error(`unrecognized location selector: ${selector}`);
}

function covers(compiled, uri) {
  if (compiled.kind === 'regex') return compiled.re.test(uri);
  if (compiled.kind === 'exact') return uri === compiled.path;
  return uri.startsWith(compiled.path);
}

function selectLocation(blocks, uri) {
  const exact = blocks.find((block) => block.compiled.kind === 'exact' && covers(block.compiled, uri));
  if (exact) return exact;
  const prefix = blocks
    .filter((block) => block.compiled.kind === 'prefix' && covers(block.compiled, uri))
    .sort((a, b) => b.compiled.path.length - a.compiled.path.length)[0];
  if (prefix?.compiled.stopRegex) return prefix;
  return blocks.find((block) => block.compiled.kind === 'regex' && covers(block.compiled, uri)) ?? prefix;
}

function isDedicatedOperatorLocation(compiled) {
  const hitsRequired = REQUIRED_URIS.some((uri) => covers(compiled, uri));
  const hitsForbidden = FORBIDDEN_URIS.some((uri) => covers(compiled, uri));
  return hitsRequired && !hitsForbidden;
}

function assertOperatorLocationsGuarded(conf, fileLabel, htpasswdPath) {
  const blocks = locationBlocks(conf).map((block) => ({
    ...block,
    compiled: compileSelector(block.selector)
  }));
  const operatorBlocks = blocks.filter((block) => isDedicatedOperatorLocation(block.compiled));

  assert.ok(operatorBlocks.length > 0, `${fileLabel}: no dedicated operator location`);

  for (const uri of REQUIRED_URIS) {
    assert.ok(
      operatorBlocks.some((block) => covers(block.compiled, uri)),
      `${fileLabel}: no operator location covers ${uri}`
    );
  }

  for (const uri of REQUIRED_URIS) {
    const selected = selectLocation(blocks, uri);
    assert.ok(operatorBlocks.includes(selected), `${fileLabel}: selected location bypasses auth for ${uri}`);
    assert.match(selected.body, uri.startsWith('/v1/')
      ? /proxy_pass http:\/\/(?:jetscope_api|127\.0\.0\.1:8000);/
      : /proxy_pass http:\/\/(?:jetscope_web|127\.0\.0\.1:3000);/,
    `${fileLabel}: ${uri} must keep its upstream`);
  }

  for (const block of operatorBlocks) {
    assert.match(block.body, /auth_basic\s+"JetScope admin";/, `${fileLabel}: location ${block.selector} lost auth_basic`);
    assert.match(
      block.body,
      /\bauth_basic_user_file\b/,
      `${fileLabel}: location ${block.selector} lost auth_basic_user_file`
    );
    assert.match(
      block.body,
      new RegExp(`auth_basic_user_file\\s+${htpasswdPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`),
      `${fileLabel}: location ${block.selector} must reference ${htpasswdPath}`
    );
    assert.match(block.body, /add_header Cache-Control "private, no-store" always;/);
    assert.match(block.body, /add_header X-Robots-Tag "noindex, nofollow" always;/);
    assert.doesNotMatch(
      block.body,
      /\$apr1\$|\$2[ayb]\$/,
      `${fileLabel}: location ${block.selector} must not inline password hashes`
    );
  }

  for (const block of blocks) {
    if (!isDedicatedOperatorLocation(block.compiled)) {
      assert.doesNotMatch(
        block.body,
        /\bauth_basic\b/,
        `${fileLabel}: location ${block.selector} is not an operator gate and must not require Basic Auth`
      );
    }
  }
}

test('infra/nginx.prod.conf guards admin and readiness locations with Basic Auth', async () => {
  const conf = await readFile(path.join(repoRoot, 'infra/nginx.prod.conf'), 'utf8');
  assertOperatorLocationsGuarded(conf, 'infra/nginx.prod.conf', PROD_HTPASSWD);
  assert.doesNotMatch(conf, /jetscope-admin\.htpasswd/);
});

test('infra/server/nginx.conf guards admin and readiness locations with Basic Auth', async () => {
  const conf = await readFile(path.join(repoRoot, 'infra/server/nginx.conf'), 'utf8');
  assertOperatorLocationsGuarded(conf, 'infra/server/nginx.conf', HOST_HTPASSWD);
});

test('readiness contract rejects a generic API regex that bypasses the gate', async () => {
  const conf = await readFile(path.join(repoRoot, 'infra/nginx.prod.conf'), 'utf8');
  const bypass = 'location ~ ^/api(?:/|$) { proxy_pass http://jetscope_web; }\n';
  assert.throws(() => assertOperatorLocationsGuarded(bypass + conf, 'bypass fixture', PROD_HTPASSWD),
    /selected location bypasses auth for \/api\/readiness/);
});

test('readiness contract rejects disabling Basic Auth', async () => {
  const conf = await readFile(path.join(repoRoot, 'infra/nginx.prod.conf'), 'utf8');
  assert.throws(() => assertOperatorLocationsGuarded(
    conf.replaceAll('auth_basic "JetScope admin";', 'auth_basic off;'), 'disabled fixture', PROD_HTPASSWD),
  /lost auth_basic/);
});

test('Compose mounts the operator htpasswd read-only at the container gate path', async () => {
  const source = await readFile(path.join(repoRoot, 'docker-compose.prod.yml'), 'utf8');
  const nginx = source.slice(source.indexOf('\n  nginx:'));
  assert.ok(nginx.includes(`source: ${HOST_HTPASSWD}`));
  assert.ok(nginx.includes(`target: ${PROD_HTPASSWD}`));
  assert.match(nginx, /read_only: true/);
  // A missing host file must fail compose, not be created as a directory.
  assert.match(nginx, /create_host_path: false/);
  assert.doesNotMatch(source, /\$apr1\$|\$2[ayb]\$/);
  assert.match(source, /JETSCOPE_API_BASE_URL: http:\/\/api:8000/);
  assert.match(source, /JETSCOPE_API_PREFIX: \/v1/);
});

test('internal readiness consumers continue to reach the API directly', async () => {
  for (const file of ['scripts/auto-deploy.sh', 'scripts/rollback.sh', 'infra/server/health-check.sh']) {
    const source = await readFile(path.join(repoRoot, file), 'utf8');
    assert.match(source, /JETSCOPE_API_READINESS_URL:-http:\/\/127\.0\.0\.1:8000\/v1\/readiness/);
  }
  const readModel = await readFile(path.join(repoRoot, 'apps/web/lib/readiness-read-model.ts'), 'utf8');
  assert.match(readModel, /fetch\(buildApiUrl\('\/readiness'\)/);
});

test('sitemap excludes every locale admin route', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/web/app/sitemap.ts'), 'utf8');
  assert.doesNotMatch(source, /\$\{BASE_URL\}\/(?:en\/|de\/)?admin/);
  assert.match(source, /\$\{BASE_URL\}\/dashboard/);
});

test('Next.js sets X-Robots-Tag noindex on admin routes', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/web/next.config.mjs'), 'utf8');
  assert.match(source, /X-Robots-Tag/);
  assert.match(source, /noindex,\s*nofollow/);
  for (const adminPath of ['/admin', '/de/admin', '/en/admin']) {
    assert.ok(
      source.includes(`source: '${adminPath}'`) || source.includes(`source: "${adminPath}"`),
      `next.config.mjs should set headers for ${adminPath}`
    );
  }
});

test('robots.txt disallows locale admin paths', async () => {
  const source = await readFile(path.join(repoRoot, 'apps/web/app/robots.ts'), 'utf8');
  for (const adminPath of ['/admin', '/de/admin', '/en/admin']) {
    assert.ok(source.includes(`'${adminPath}'`), `robots.ts should disallow ${adminPath}`);
  }
});

test('deploy docs describe host-nginx admin gate without embedding secrets', async () => {
  const doc = await readFile(path.join(repoRoot, 'docs/DEPLOY_USA_VPS.md'), 'utf8');
  assert.match(doc, /auth_basic/);
  assert.match(doc, /auth_basic_user_file/);
  assert.match(doc, /htpasswd/);
  assert.match(doc, /jetscope-admin\.htpasswd/);
  assert.doesNotMatch(doc, /\$apr1\$|\$2[ayb]\$/);
});
