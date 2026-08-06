import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * A ratchet for the P1.5 page conversion, in the same spirit as
 * scripts/design-system-baseline.json: once a page is converted it may not slip
 * back, and the properties the template exists to guarantee are asserted rather
 * than assumed.
 *
 * Add a page here as it is converted. Do not remove entries.
 */
const CONVERTED_PAGES = [
  'apps/web/app/heat/page.tsx',
  'apps/web/app/reports/page.tsx',
  'apps/web/app/de/reports/page.tsx',
  'apps/web/app/en/reports/page.tsx',
  'apps/web/app/crisis/page.tsx',
  'apps/web/app/de/crisis/page.tsx',
  'apps/web/app/en/crisis/page.tsx',
  'apps/web/app/dashboard/page.tsx',
  'apps/web/app/de/dashboard/page.tsx',
  'apps/web/app/en/dashboard/page.tsx',
  'apps/web/app/sources/page.tsx',
  'apps/web/app/de/sources/page.tsx',
  'apps/web/app/en/sources/page.tsx',
  'apps/web/app/prices/germany-jet-fuel/page.tsx',
  'apps/web/app/de/prices/germany-jet-fuel/page.tsx',
  'apps/web/app/en/prices/germany-jet-fuel/page.tsx'
];

/** Pages that render a read model with an isFallback flag. */
const FALLBACK_AWARE_PAGES = [
  'apps/web/app/reports/page.tsx',
  'apps/web/app/de/reports/page.tsx',
  'apps/web/app/en/reports/page.tsx',
  'apps/web/app/dashboard/page.tsx',
  'apps/web/app/de/dashboard/page.tsx',
  'apps/web/app/en/dashboard/page.tsx',
  'apps/web/app/sources/page.tsx',
  'apps/web/app/de/sources/page.tsx',
  'apps/web/app/en/sources/page.tsx',
  'apps/web/app/prices/germany-jet-fuel/page.tsx',
  'apps/web/app/de/prices/germany-jet-fuel/page.tsx',
  'apps/web/app/en/prices/germany-jet-fuel/page.tsx'
];

/**
 * Pages on the crisis-brief contract. It reports a fallback through `error`
 * rather than an `isFallback` flag, so the guard reads differently - but the
 * property being held is identical: never stamp invented values as fresh.
 */
const CRISIS_BRIEF_PAGES = ['apps/web/app/de/crisis/page.tsx', 'apps/web/app/en/crisis/page.tsx'];

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('converted pages use the template rather than Shell directly', async () => {
  for (const path of CONVERTED_PAGES) {
    const source = await read(path);
    assert.match(source, /<PageTemplate/, `${path} must render PageTemplate`);
    assert.doesNotMatch(source, /<Shell\b/, `${path} must not reach past the template to Shell`);
  }
});

test('every converted page states the decision question it answers', async () => {
  for (const path of CONVERTED_PAGES) {
    const source = await read(path);
    const match = source.match(/question="([^"]+)"/);
    assert.ok(match, `${path} must pass a question to PageTemplate`);
    assert.ok(
      match[1].trim().length > 10,
      `${path} question must be a real sentence, got: ${match[1]}`
    );
  }
});

test('every converted page ends with its sources', async () => {
  for (const path of CONVERTED_PAGES) {
    const source = await read(path);
    assert.match(source, /<SourceFooter/, `${path} must close with SourceFooter (contract section 2 rule 4)`);
    assert.match(source, /limitations=\{/, `${path} must state its limitations, not imply completeness`);
  }
});

test('a page on fallback data never stamps it with a fresh timestamp', async () => {
  // The fallback read model sets generated_at to the current time. Rendering
  // that as a data timestamp would present fabricated values as freshly
  // observed, which is the failure this contract exists to prevent.
  for (const path of FALLBACK_AWARE_PAGES) {
    const source = await read(path);
    // Matched loosely on purpose: the guarantee is "the stamp is gated on
    // isFallback", not one particular spelling of it. Pinning the exact line
    // would make a prettier run look like a contract violation.
    assert.match(
      source,
      /readModel\.isFallback\s*\?\s*null\s*:\s*(?:readModel\.market\.generated_at|readModel\.generatedAt|observedAsOf)/,
      `${path} must suppress the timestamp while on fallback data`
    );
    assert.match(
      source,
      /basis:\s*readModel\.isFallback\s*\?\s*'assumption'\s*:\s*'observed'/,
      `${path} must label fallback data as an assumption, never as observed`
    );
  }
});

test('a crisis-brief page on fallback data never stamps it with a fresh timestamp', async () => {
  for (const path of CRISIS_BRIEF_PAGES) {
    const source = await read(path);
    assert.match(
      source,
      /readModel\.error\s*\?\s*null\s*:/,
      `${path} must suppress the timestamp while the crisis brief is on fallback`
    );
    assert.match(
      source,
      /basis:\s*readModel\.error\s*\?\s*'assumption'\s*:\s*'observed'/,
      `${path} must label fallback data as an assumption, never as observed`
    );
  }
});

test('a reserve reading is labelled by how it was produced, not assumed observed', async () => {
  // A hand estimate presented with the same weight as an official filing is
  // the failure this contract exists to prevent, so every crisis page has to
  // route source_type through a basis mapping rather than hardcoding observed.
  for (const path of ['apps/web/app/crisis/page.tsx', ...CRISIS_BRIEF_PAGES]) {
    const source = await read(path);
    assert.match(source, /function reserveBasis\(/, `${path} must map reserve source_type to a basis`);
    assert.match(source, /return 'assumption'/, `${path} must fall back to assumption, not to observed`);
  }
});
