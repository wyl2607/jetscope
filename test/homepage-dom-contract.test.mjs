import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const HOME_PATH = new URL('../public/index.html', import.meta.url);
const EXPLORER_PATH = new URL('../public/explorer.html', import.meta.url);

const REQUIRED_IDS = [
  'breakeven-formula',
  'breakeven-controls',
  'breakeven-core-metrics',
  'breakeven-route-list',
  'crude-slider',
  'carbon-slider',
  'subsidy-slider',
  'crude-source',
  'carbon-source',
  'benchmark-mode',
  'slope-input',
  'intercept-input',
  'auto-refresh',
  'local-state',
  'source-lock-card'
];

test('homepage keeps lightweight snapshot contract (no slider workbench)', async () => {
  const html = await readFile(HOME_PATH, 'utf8');

  assert.match(html, /id="home-hero-stat"/);
  assert.match(html, /id="home-signal-grid"/);
  assert.match(html, /id="home-top-routes"/);
  assert.doesNotMatch(html, /id="crude-slider"/);
  assert.doesNotMatch(html, /id="carbon-slider"/);
  assert.doesNotMatch(html, /id="subsidy-slider"/);
  assert.doesNotMatch(html, /id="industry-signal-cards"/);
  assert.doesNotMatch(html, /id="industry-countries"/);
});

test('explorer owns the full decision-surface ids and ordering contract', async () => {
  const html = await readFile(EXPLORER_PATH, 'utf8');

  for (const id of REQUIRED_IDS) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  const costIndex = html.indexOf('id="breakeven-formula"');
  const formulaIndex = html.indexOf('id="breakeven-formula"');
  const routeListIndex = html.indexOf('id="breakeven-route-list"');
  const scenarioIndex = html.indexOf('id="local-state"');

  assert.ok(costIndex >= 0);
  assert.ok(formulaIndex >= costIndex);
  assert.ok(routeListIndex > formulaIndex);
  assert.ok(scenarioIndex > routeListIndex);
});
