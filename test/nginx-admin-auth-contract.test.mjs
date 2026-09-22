import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Edge Basic Auth for the admin UI is a security contract. The current nginx
// files (after the #351 cache/CSP rewrite) use one regex location rather than
// the exact-plus-prefix blocks from #325. This test checks that shape: every
// admin URI is covered, /administrator is not, and the covering block keeps
// auth_basic. Static checks only — no live nginx.

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
  '/de/admin/settings'
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
  '/de/dashboard'
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
    return { kind: 'prefix', path: parts[1] };
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

function isDedicatedAdminLocation(compiled) {
  const hitsRequired = REQUIRED_URIS.some((uri) => covers(compiled, uri));
  const hitsForbidden = FORBIDDEN_URIS.some((uri) => covers(compiled, uri));
  return hitsRequired && !hitsForbidden;
}

function assertAdminLocationsGuarded(conf, fileLabel, htpasswdPath) {
  const blocks = locationBlocks(conf).map((block) => ({
    ...block,
    compiled: compileSelector(block.selector)
  }));
  const adminBlocks = blocks.filter((block) => isDedicatedAdminLocation(block.compiled));

  assert.ok(adminBlocks.length > 0, `${fileLabel}: no dedicated admin location`);

  for (const uri of REQUIRED_URIS) {
    assert.ok(
      adminBlocks.some((block) => covers(block.compiled, uri)),
      `${fileLabel}: no admin location covers ${uri}`
    );
  }

  for (const block of adminBlocks) {
    assert.match(block.body, /\bauth_basic\b/, `${fileLabel}: location ${block.selector} lost auth_basic`);
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
    assert.doesNotMatch(
      block.body,
      /\$apr1\$|\$2[ayb]\$/,
      `${fileLabel}: location ${block.selector} must not inline password hashes`
    );
  }

  for (const block of blocks) {
    if (!isDedicatedAdminLocation(block.compiled)) {
      assert.doesNotMatch(
        block.body,
        /\bauth_basic\b/,
        `${fileLabel}: location ${block.selector} is not an admin gate and must not require Basic Auth`
      );
    }
  }
}

test('infra/nginx.prod.conf guards admin locations with Basic Auth', async () => {
  const conf = await readFile(path.join(repoRoot, 'infra/nginx.prod.conf'), 'utf8');
  assertAdminLocationsGuarded(conf, 'infra/nginx.prod.conf', PROD_HTPASSWD);
  assert.doesNotMatch(conf, /jetscope-admin\.htpasswd/);
});

test('infra/server/nginx.conf guards admin locations with Basic Auth', async () => {
  const conf = await readFile(path.join(repoRoot, 'infra/server/nginx.conf'), 'utf8');
  assertAdminLocationsGuarded(conf, 'infra/server/nginx.conf', HOST_HTPASSWD);
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
