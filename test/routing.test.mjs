import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const APP_DIR = new URL('../apps/web/app/', import.meta.url);

const ROUTES = [
  ['', 'JetScope'],
  ['dashboard/page.tsx', '决策驾驶舱'],
  ['crisis/page.tsx', '危机监测'],
  ['crisis/eu-jet-reserves/page.tsx', 'EU 航油储备危机'],
  ['crisis/saf-tipping-point/page.tsx', 'SAF 临界点'],
  ['sources/page.tsx', '来源'],
  ['research/page.tsx', '研究信号'],
  ['reports/tipping-point-analysis/page.tsx', '临界点报告']
];

test('current JetScope routes expose canonical product surfaces', async () => {
  for (const [relativePath, expectedCopy] of ROUTES) {
    const pagePath = relativePath ? `${relativePath}` : 'page.tsx';
    const source = await readFile(new URL(pagePath, APP_DIR), 'utf8');

    assert.match(source, new RegExp(expectedCopy, 'i'), `${pagePath} should include ${expectedCopy}`);
  }
});
