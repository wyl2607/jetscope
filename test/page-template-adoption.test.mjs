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
  'apps/web/app/en/reports/page.tsx'
];

/** Pages that render a read model with an isFallback flag. */
const FALLBACK_AWARE_PAGES = [
  'apps/web/app/reports/page.tsx',
  'apps/web/app/de/reports/page.tsx',
  'apps/web/app/en/reports/page.tsx'
];

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
    assert.match(
      source,
      /const asOf = readModel\.isFallback \? null : readModel\.market\.generated_at;/,
      `${path} must suppress the timestamp while on fallback data`
    );
    assert.match(
      source,
      /basis: readModel\.isFallback \? 'assumption' : 'observed'/,
      `${path} must label fallback data as an assumption, never as observed`
    );
  }
});
