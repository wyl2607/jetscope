import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ZH_PATH = new URL('../public/routes-detail.html', import.meta.url);
const EN_PATH = new URL('../public/en/routes-detail.html', import.meta.url);

test('route detail pages keep dedicated anchors and runtime script', async () => {
  const [zhHtml, enHtml] = await Promise.all([readFile(ZH_PATH, 'utf8'), readFile(EN_PATH, 'utf8')]);

  for (const html of [zhHtml, enHtml]) {
    assert.match(html, /id="route-detail-title"/);
    assert.match(html, /id="route-detail-subtitle"/);
    assert.match(html, /id="route-detail-content"/);
    assert.match(html, /src="\/route-detail\.js"/);
  }
});
