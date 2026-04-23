import test from 'node:test';
import assert from 'node:assert/strict';

import { startMockedServer } from './helpers/server-harness.mjs';

const CASES = [
  ['/', 'SAFvsOil · Home'],
  ['/explorer', 'SAFvsOil · Explorer'],
  ['/routes', 'SAFvsOil · Routes'],
  ['/routes/sugar-atj', 'SAFvsOil · Route Detail'],
  ['/industry', 'SAFvsOil · Industry'],
  ['/scenarios', 'SAFvsOil · Scenarios'],
  ['/sources', 'SAFvsOil · Sources'],
  ['/methodology', 'SAFvsOil · Methodology'],
  ['/en', 'SAFvsOil · Home'],
  ['/en/explorer', 'SAFvsOil · Explorer']
];

test('phase-0 multi-page routing returns 200 with expected title', async () => {
  const server = await startMockedServer();

  try {
    for (const [pathname, title] of CASES) {
      const response = await fetch(`http://127.0.0.1:${server.port}${pathname}`);
      const html = await response.text();

      assert.equal(response.status, 200, `${pathname} should return 200`);
      assert.match(html, new RegExp(`<title>${title}</title>`), `${pathname} should expose title`);
    }
  } finally {
    await server.close();
  }
});
