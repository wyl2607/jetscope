import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const APP_DIR = new URL('../apps/web/app/', import.meta.url);
const LOCALES_DIR = new URL('../apps/web/src/locales/', import.meta.url);

/**
 * Routes migrated to `app/[locale]` (P2). Their copy is no longer in the page
 * file, so asserting on the page source would only prove the file exists. The
 * dictionary test below is what checks their words instead.
 */
const MIGRATED = [
  { route: '/faq', dir: 'faq', copyKey: 'faq', titles: { zh: '常见问题', de: 'Häufige Fragen', en: 'Frequently Asked Questions' } },
  { route: '/reports', dir: 'reports', copyKey: 'reports', titles: { zh: '报告工作台', de: 'Berichtswerkstatt', en: 'Report Workbench' } }
];

/**
 * Where a public path may have its page file. `/de/faq` is either
 * `app/de/faq/page.tsx` (not migrated) or `app/[locale]/faq/page.tsx`
 * (migrated); `/faq` is either `app/faq/page.tsx` or the same `[locale]` file,
 * because `zh` is served without a prefix.
 */
function candidatePagePaths(route) {
  if (route === '/') return ['page.tsx', '[locale]/page.tsx'];
  const segments = route.slice(1).split('/');
  const localised = ['de', 'en'].includes(segments[0]) ? segments.slice(1) : segments;
  return [`${segments.join('/')}/page.tsx`, `[locale]/${localised.join('/')}/page.tsx`];
}

const ROUTES = [
  ['', 'JetScope'],
  ['dashboard/page.tsx', '决策驾驶舱'],
  ['en/page.tsx', 'JetScope Europe'],
  ['en/dashboard/page.tsx', 'Decision Cockpit'],
  ['en/crisis/page.tsx', 'Fuel Stress Brief'],
  ['en/prices/germany-jet-fuel/page.tsx', 'Germany Jet-Fuel Price Monitor'],
  ['en/sources/page.tsx', 'Source Review'],
  ['en/research/page.tsx', 'Research Workbench'],
  ['en/reports/tipping-point-analysis/page.tsx', 'Tipping-Point Report'],
  ['en/admin/page.tsx', 'Launch Readiness'],
  ['en/scenarios/page.tsx', 'Scenario Workbench'],
  ['en/lufthansa-saf-2026/page.tsx', 'Lufthansa SAF Inflection Review'],
  ['de/page.tsx', 'JetScope Deutschland'],
  ['de/dashboard/page.tsx', 'Entscheidungscockpit'],
  ['de/crisis/page.tsx', 'Krisenbrief'],
  ['de/prices/germany-jet-fuel/page.tsx', 'Deutschland Jet-Fuel Preis-Monitor'],
  ['de/sources/page.tsx', 'Quellenprüfung'],
  ['de/admin/page.tsx', 'Startbereitschaft'],
  ['de/scenarios/page.tsx', 'Szenario-Workbench'],
  ['de/reports/tipping-point-analysis/page.tsx', 'Kipppunktbericht'],
  ['de/research/page.tsx', 'Forschungswerkstatt'],
  ['crisis/page.tsx', '危机监测'],
  ['crisis/eu-jet-reserves/page.tsx', 'EU 航油储备危机'],
  ['crisis/saf-tipping-point/page.tsx', 'SAF 临界点'],
  ['grid/page.tsx', '电网平价分析'],
  ['heat/page.tsx', '供暖平价分析'],
  ['sources/page.tsx', '来源'],
  ['research/page.tsx', '研究信号'],
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

test('migrated routes exist once under [locale] and carry copy in every locale', async () => {
  for (const { route, dir, copyKey, titles } of MIGRATED) {
    // One page file, not three.
    await assert.doesNotReject(
      () => readFile(new URL(`[locale]/${dir}/page.tsx`, APP_DIR), 'utf8'),
      `${route} should live at app/[locale]/${dir}/page.tsx`
    );
    for (const stale of [`${dir}/page.tsx`, `de/${dir}/page.tsx`, `en/${dir}/page.tsx`]) {
      await assert.rejects(
        () => readFile(new URL(stale, APP_DIR), 'utf8'),
        `${stale} should be gone once ${route} is under [locale]`
      );
    }

    // Copy moved to the dictionaries rather than disappearing (section 4 rule 3).
    for (const [locale, title] of Object.entries(titles)) {
      const dict = JSON.parse(await readFile(new URL(`${locale}.json`, LOCALES_DIR), 'utf8'));
      assert.ok(dict[copyKey], `${locale}.json should define the "${copyKey}" namespace`);
      assert.equal(dict[copyKey].title, title, `${locale}.json ${copyKey}.title`);
    }
  }
});

/**
 * Mirror of apps/web/middleware.ts isMigrated. Kept here (not imported) because
 * middleware pulls in next/server, which node:test cannot resolve outside Next.
 * If the middleware shape drifts, the source assertions below fail first.
 */
function isMigratedMirror(pathname, entries) {
  return entries.some(({ path, match }) =>
    match === 'exact'
      ? pathname === path
      : pathname === path || pathname.startsWith(`${path}/`)
  );
}

test('/reports migrates exactly; /reports/tipping-point-analysis stays reachable', async () => {
  const middleware = await readFile(new URL('../apps/web/middleware.ts', import.meta.url), 'utf8');

  // Contract: reports is exact, faq stays prefix. A prefix match on /reports
  // would rewrite /reports/tipping-point-analysis → /zh/reports/... and 404.
  assert.match(
    middleware,
    /path:\s*'\/reports',\s*match:\s*'exact'/,
    'middleware must list /reports as an exact match'
  );
  assert.match(
    middleware,
    /path:\s*'\/faq',\s*match:\s*'prefix'/,
    'middleware must keep /faq as a prefix match'
  );

  const entries = [
    { path: '/faq', match: 'prefix' },
    { path: '/reports', match: 'exact' }
  ];
  assert.equal(isMigratedMirror('/reports', entries), true);
  assert.equal(
    isMigratedMirror('/reports/tipping-point-analysis', entries),
    false,
    'unmigrated child must not be claimed by the /reports exact entry'
  );
  assert.equal(isMigratedMirror('/faq', entries), true);
  assert.equal(isMigratedMirror('/faq/anything', entries), true);

  // The child page files still live outside [locale], so Next can serve them.
  for (const relative of [
    'reports/tipping-point-analysis/page.tsx',
    'de/reports/tipping-point-analysis/page.tsx',
    'en/reports/tipping-point-analysis/page.tsx'
  ]) {
    await assert.doesNotReject(
      () => readFile(new URL(relative, APP_DIR), 'utf8'),
      `${relative} must remain so /reports/tipping-point-analysis stays reachable`
    );
  }
});

test('localized sitemap includes published English and German route surfaces', async () => {
  const source = await readFile(new URL('../apps/web/app/sitemap.ts', import.meta.url), 'utf8');
  const routes = [
    '/crisis',
    '/grid',
    '/heat',
    '/en/crisis',
    '/en/prices/germany-jet-fuel',
    '/en/lufthansa-saf-2026',
    '/en/faq',
    '/reports/tipping-point-analysis',
    '/de/faq',
    '/de/crisis',
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
    // A route resolves either to a per-locale directory (pre-P2) or to the
    // shared `[locale]` one. Checking only the first would fail every route the
    // moment it is migrated, and checking only the second would pass routes
    // that do not exist yet - so a route must satisfy exactly one of them.
    const candidates = candidatePagePaths(route);
    const found = await Promise.all(
      candidates.map((candidate) =>
        readFile(new URL(candidate, APP_DIR), 'utf8').then(
          () => true,
          () => false
        )
      )
    );

    // Exactly one, not at least one. Both existing means a migration stopped
    // half way: Next resolves the static segment and the `[locale]` page silently
    // stops being the one that serves, so the copy someone just moved into the
    // dictionaries never reaches a reader.
    const matches = found.filter(Boolean).length;
    assert.equal(
      matches,
      1,
      matches === 0
        ? `sitemap route ${route} should map to one of: ${candidates.join(', ')}`
        : `sitemap route ${route} resolves to both ${candidates.join(' and ')} - delete the per-locale copy`
    );
  }
});
