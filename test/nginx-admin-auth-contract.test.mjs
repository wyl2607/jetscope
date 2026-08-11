import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Edge Basic Auth for /admin is a security contract: if a location block for
// the admin UI loses auth_basic, anonymous visitors see operational detail.
// Static config checks catch that without needing a live nginx.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ADMIN_PATHS = ['/admin', '/de/admin', '/en/admin'];

/**
 * Split an nginx conf into top-level `location ... { ... }` blocks.
 * Nested braces inside a location are rare in these files; if a block does
 * not balance, it is skipped rather than mis-attributed.
 */
function locationBlocks(conf) {
  const blocks = [];
  const re = /location\s+([^{]+)\{/g;
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

/**
 * A `location` selector is `[modifier] path` — `= /admin`, `^~ /admin/`, or a
 * bare `/admin`. Return just the path, so blocks can be matched by value.
 * Building a regex out of the path instead would need escaping and would still
 * be a looser test than equality.
 */
function locationPath(selector) {
  const parts = selector.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function matchesAdminPath(selector, adminPath) {
  const path = locationPath(selector);
  // The trailing-slash form is the prefix location for the same route.
  // Equality is what keeps /administrator out.
  return path === adminPath || path === `${adminPath}/`;
}

function isAdminLocation(selector) {
  return ADMIN_PATHS.some((adminPath) => matchesAdminPath(selector, adminPath));
}

function assertAdminLocationsGuarded(conf, fileLabel) {
  const blocks = locationBlocks(conf);
  const adminBlocks = blocks.filter((block) => isAdminLocation(block.selector));

  assert.ok(
    adminBlocks.length >= ADMIN_PATHS.length,
    `${fileLabel}: expected at least one location per admin path (${ADMIN_PATHS.join(', ')}); found ${adminBlocks.length}`
  );

  for (const adminPath of ADMIN_PATHS) {
    const matching = adminBlocks.filter((block) => matchesAdminPath(block.selector, adminPath));
    assert.ok(
      matching.length > 0,
      `${fileLabel}: missing location for ${adminPath}`
    );
    for (const block of matching) {
      assert.match(
        block.body,
        /\bauth_basic\b/,
        `${fileLabel}: location ${block.selector} lost auth_basic`
      );
      assert.match(
        block.body,
        /\bauth_basic_user_file\b/,
        `${fileLabel}: location ${block.selector} lost auth_basic_user_file`
      );
      // Credentials by path only — no inline htpasswd hashes (typically $apr1$ / $2y$).
      assert.doesNotMatch(
        block.body,
        /\$apr1\$|\$2[ayb]\$/,
        `${fileLabel}: location ${block.selector} must not inline password hashes`
      );
    }
  }
}

test('infra/nginx.prod.conf guards admin locations with Basic Auth', async () => {
  const conf = await readFile(path.join(repoRoot, 'infra/nginx.prod.conf'), 'utf8');
  assertAdminLocationsGuarded(conf, 'infra/nginx.prod.conf');
  assert.match(conf, /\/etc\/nginx\/secrets\/admin\.htpasswd/);
});

test('infra/server/nginx.conf guards admin locations with Basic Auth', async () => {
  const conf = await readFile(path.join(repoRoot, 'infra/server/nginx.conf'), 'utf8');
  assertAdminLocationsGuarded(conf, 'infra/server/nginx.conf');
  assert.match(conf, /\/etc\/nginx\/secrets\/jetscope-admin\.htpasswd/);
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

test('deploy docs describe host-nginx admin gate without embedding secrets', async () => {
  const doc = await readFile(path.join(repoRoot, 'docs/DEPLOY_USA_VPS.md'), 'utf8');
  assert.match(doc, /auth_basic/);
  assert.match(doc, /auth_basic_user_file/);
  assert.match(doc, /htpasswd/);
  assert.match(doc, /jetscope-admin\.htpasswd/);
  assert.doesNotMatch(doc, /\$apr1\$|\$2[ayb]\$/);
});
