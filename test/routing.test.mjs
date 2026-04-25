import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const APP_DIR = new URL('../apps/web/app/', import.meta.url);

const ROUTES = [
  ['', 'JetScope'],
  ['dashboard/page.tsx', 'Dashboard'],
  ['crisis/page.tsx', 'Crisis'],
  ['crisis/eu-jet-reserves/page.tsx', 'EU Jet Fuel Reserve'],
  ['crisis/saf-tipping-point/page.tsx', 'SAF Tipping Point'],
  ['sources/page.tsx', 'Sources'],
  ['research/page.tsx', 'Research'],
  ['reports/tipping-point-analysis/page.tsx', 'Tipping Point']
];

test('current JetScope routes expose canonical product surfaces', async () => {
  for (const [relativePath, expectedCopy] of ROUTES) {
    const pagePath = relativePath ? `${relativePath}` : 'page.tsx';
    const source = await readFile(new URL(pagePath, APP_DIR), 'utf8');

    assert.match(source, new RegExp(expectedCopy, 'i'), `${pagePath} should include ${expectedCopy}`);
  }
});
