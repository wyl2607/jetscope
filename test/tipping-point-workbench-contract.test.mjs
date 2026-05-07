import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const WORKBENCH_PATH = new URL('../apps/web/components/tipping-point-workbench.tsx', import.meta.url);
const PAGE_PATH = new URL('../apps/web/app/crisis/saf-tipping-point/page.tsx', import.meta.url);
const LIGHT_UI_SURFACES = [
  new URL('../apps/web/components/shell.tsx', import.meta.url),
  PAGE_PATH,
  WORKBENCH_PATH,
  new URL('../apps/web/components/airline-decision-matrix.tsx', import.meta.url),
  new URL('../apps/web/components/fuel-vs-saf-price-chart.tsx', import.meta.url),
  new URL('../apps/web/components/saf-pathway-comparison-table.tsx', import.meta.url),
  new URL('../apps/web/components/scenario-cost-stack-chart.tsx', import.meta.url),
  new URL('../apps/web/components/tipping-point-simulator.tsx', import.meta.url)
];

test('tipping point page is wired to interactive workbench', async () => {
  const page = await readFile(PAGE_PATH, 'utf8');

  assert.match(page, /TippingPointWorkbench/);
  assert.match(page, /liveDefaults/);
  assert.match(page, /jet_eu_proxy_usd_per_l/);
});

test('tipping point workbench keeps API recompute, URL state, and scenario save contracts', async () => {
  const source = await readFile(WORKBENCH_PATH, 'utf8');

  assert.match(source, /\/api\/analysis\/tipping-point\?/);
  assert.match(source, /\/api\/analysis\/airline-decision\?/);
  assert.match(source, /router\.replace\(`\/crisis\/saf-tipping-point\?\$\{query\}`/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /\/api\/scenarios/);
  assert.match(source, /x-admin-token/);
  assert.match(source, /使用实时值/);
});

test('SAF tipping point workflow stays on the light workbench theme', async () => {
  for (const file of LIGHT_UI_SURFACES) {
    const source = await readFile(file, 'utf8');

    assert.doesNotMatch(
      source,
      /bg-slate-950(?!\/)|bg-slate-950\/|bg-slate-900\/70|from-slate-900|to-black/,
      `${file.pathname} should not hard-code dark workbench panels`
    );
  }
});

test('SAF tipping point recompute errors are user-facing fallback copy', async () => {
  const source = await readFile(WORKBENCH_PATH, 'utf8');

  assert.doesNotMatch(source, /setError\(err instanceof Error \? err\.message/, 'raw fetch errors must not be shown to users');
  assert.match(source, /分析服务暂时不可用/);
});
