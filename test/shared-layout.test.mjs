import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PAGE_FILES = [
  'index.html',
  'explorer.html',
  'routes.html',
  'routes-detail.html',
  'industry.html',
  'scenarios.html',
  'sources.html',
  'methodology.html',
  'en/index.html',
  'en/explorer.html',
  'en/routes.html',
  'en/routes-detail.html',
  'en/industry.html',
  'en/scenarios.html',
  'en/sources.html',
  'en/methodology.html'
];

test('all core pages include shared header/footer mounts and layout loader', async () => {
  for (const page of PAGE_FILES) {
    const html = await readFile(new URL(`../public/${page}`, import.meta.url), 'utf8');
    assert.match(html, /id="site-header"/, `${page} should include header mount`);
    assert.match(html, /id="site-footer"/, `${page} should include footer mount`);
    assert.match(html, /src="\/_shared\/layout\.js"/, `${page} should load shared layout`);
  }
});
