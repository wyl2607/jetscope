import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ZH_HOME_PATH = new URL('../public/index.html', import.meta.url);
const EN_HOME_PATH = new URL('../public/en/index.html', import.meta.url);

const HOME_REQUIRED_IDS = ['home-hero-stat', 'home-signal-grid', 'home-top-routes'];

async function assertHomeContracts(path) {
  const html = await readFile(path, 'utf8');
  for (const id of HOME_REQUIRED_IDS) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.doesNotMatch(html, /id="industry-signal-cards"/);
  assert.doesNotMatch(html, /id="industry-countries"/);
}

test('zh homepage keeps compact snapshot DOM anchors', async () => {
  await assertHomeContracts(ZH_HOME_PATH);
});

test('en homepage keeps compact snapshot DOM anchors', async () => {
  await assertHomeContracts(EN_HOME_PATH);
});
