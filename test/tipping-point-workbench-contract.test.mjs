import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const WORKBENCH_PATH = new URL('../apps/web/components/tipping-point-workbench.tsx', import.meta.url);
const PAGE_PATH = new URL('../apps/web/app/crisis/saf-tipping-point/page.tsx', import.meta.url);

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
  assert.match(source, /Use live values/);
});
