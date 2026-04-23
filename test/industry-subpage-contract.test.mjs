import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const INDUSTRY_ZH_PATH = new URL('../public/industry.html', import.meta.url);
const INDUSTRY_EN_PATH = new URL('../public/en/industry.html', import.meta.url);

const REQUIRED_IDS = [
  'industry-dashboard',
  'industry-signal-cards',
  'industry-countries',
  'industry-airlines',
  'industry-pathways',
  'industry-timeline'
];

test('industry subpage keeps dedicated dashboard anchors in zh locale', async () => {
  const html = await readFile(INDUSTRY_ZH_PATH, 'utf8');

  for (const id of REQUIRED_IDS) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /as of 2026-Q1/i);
  assert.match(html, /src="\/app\.js"/);
});

test('industry subpage keeps dedicated dashboard anchors in en locale', async () => {
  const html = await readFile(INDUSTRY_EN_PATH, 'utf8');

  for (const id of REQUIRED_IDS) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /as of 2026-Q1/i);
  assert.match(html, /src="\/app\.js"/);
});

test('industry subpages do not introduce independent slider state', async () => {
  const [zhHtml, enHtml] = await Promise.all([
    readFile(INDUSTRY_ZH_PATH, 'utf8'),
    readFile(INDUSTRY_EN_PATH, 'utf8')
  ]);

  for (const html of [zhHtml, enHtml]) {
    assert.doesNotMatch(html, /id="crude-slider"/);
    assert.doesNotMatch(html, /id="carbon-slider"/);
    assert.doesNotMatch(html, /id="subsidy-slider"/);
  }
});
