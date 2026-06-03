import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const APP_DIR = new URL('../apps/web/app/', import.meta.url);

const ROUTES = [
  ['', 'JetScope'],
  ['faq/page.tsx', '常见问题'],
  ['dashboard/page.tsx', '决策驾驶舱'],
  ['en/page.tsx', 'JetScope Europe'],
  ['en/faq/page.tsx', 'Frequently Asked Questions'],
  ['en/dashboard/page.tsx', 'Decision Cockpit'],
  ['en/prices/germany-jet-fuel/page.tsx', 'Germany Jet-Fuel Price Monitor'],
  ['en/sources/page.tsx', 'Source Review'],
  ['en/research/page.tsx', 'Research Workbench'],
  ['en/reports/page.tsx', 'Report Workbench'],
  ['en/reports/tipping-point-analysis/page.tsx', 'Tipping-Point Report'],
  ['en/admin/page.tsx', 'Launch Readiness'],
  ['en/scenarios/page.tsx', 'Scenario Workbench'],
  ['en/lufthansa-saf-2026/page.tsx', 'Lufthansa SAF Inflection Review'],
  ['de/page.tsx', 'JetScope Deutschland'],
  ['de/faq/page.tsx', 'Häufige Fragen'],
  ['de/dashboard/page.tsx', 'Entscheidungscockpit'],
  ['de/prices/germany-jet-fuel/page.tsx', 'Deutschland Jet-Fuel Preis-Monitor'],
  ['de/sources/page.tsx', 'Quellenprüfung'],
  ['de/admin/page.tsx', 'Startbereitschaft'],
  ['de/scenarios/page.tsx', 'Szenario-Workbench'],
  ['de/reports/page.tsx', 'Berichtswerkstatt'],
  ['de/reports/tipping-point-analysis/page.tsx', 'Kipppunktbericht'],
  ['de/research/page.tsx', 'Forschungswerkstatt'],
  ['crisis/page.tsx', '危机监测'],
  ['crisis/eu-jet-reserves/page.tsx', 'EU 航油储备危机'],
  ['crisis/saf-tipping-point/page.tsx', 'SAF 临界点'],
  ['sources/page.tsx', '来源'],
  ['research/page.tsx', '研究信号'],
  ['reports/page.tsx', '报告工作台'],
  ['admin/page.tsx', '上线前置状态'],
  ['scenarios/page.tsx', '情景工作区'],
  ['reports/tipping-point-analysis/page.tsx', '临界点报告']
];

test('current JetScope routes expose canonical product surfaces', async () => {
  for (const [relativePath, expectedCopy] of ROUTES) {
    const pagePath = relativePath ? `${relativePath}` : 'page.tsx';
    const source = await readFile(new URL(pagePath, APP_DIR), 'utf8');

    assert.match(source, new RegExp(expectedCopy, 'i'), `${pagePath} should include ${expectedCopy}`);
  }
});

test('localized sitemap includes published English and German route surfaces', async () => {
  const source = await readFile(new URL('../apps/web/app/sitemap.ts', import.meta.url), 'utf8');
  const routes = [
    '/en/prices/germany-jet-fuel',
    '/en/lufthansa-saf-2026',
    '/en/faq',
    '/reports/tipping-point-analysis',
    '/de/faq',
    '/de/sources',
    '/de/research',
    '/en/reports/tipping-point-analysis',
    '/de/reports',
    '/de/reports/tipping-point-analysis',
    '/de/admin',
    '/de/scenarios',
    '/de/lufthansa-saf-2026'
  ];

  for (const route of routes) {
    assert.match(source, new RegExp(`\\$\\{BASE_URL\\}${route}`), `sitemap should include ${route}`);
  }
});

test('sitemap only advertises app pages that exist', async () => {
  const source = await readFile(new URL('../apps/web/app/sitemap.ts', import.meta.url), 'utf8');
  const routes = [...source.matchAll(/url: `\$\{BASE_URL\}([^`]+)`/g)].map((match) => match[1]);

  assert.ok(routes.length > 0, 'sitemap should declare at least one route');

  for (const route of routes) {
    const pagePath = route === '/' ? 'page.tsx' : `${route.slice(1)}/page.tsx`;
    await assert.doesNotReject(
      () => readFile(new URL(pagePath, APP_DIR), 'utf8'),
      `sitemap route ${route} should map to ${pagePath}`
    );
  }
});
