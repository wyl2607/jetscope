import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ZH_PATH = new URL('../public/methodology.html', import.meta.url);
const EN_PATH = new URL('../public/en/methodology.html', import.meta.url);

test('methodology pages keep formulas, state ownership, and parser version notes', async () => {
  const [zhHtml, enHtml] = await Promise.all([readFile(ZH_PATH, 'utf8'), readFile(EN_PATH, 'utf8')]);

  for (const html of [zhHtml, enHtml]) {
    assert.match(html, /breakEvenCrude/);
    assert.match(html, /Parser version|Parser 版本|wave1-market-v2/);
    assert.match(html, /scenario/);
    assert.match(html, /npm run preflight/);
  }
});
