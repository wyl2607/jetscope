import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'scripts/preflight-ui-e2e.mjs'), 'utf8');

function assertContains(snippet, message) {
  assert.ok(source.includes(snippet), message);
}

function assertOrdered(snippets, message) {
  let cursor = -1;
  for (const snippet of snippets) {
    const next = source.indexOf(snippet, cursor + 1);
    assert.notEqual(next, -1, `${message}: missing ${snippet}`);
    assert.ok(next > cursor, `${message}: ${snippet} is out of order`);
    cursor = next;
  }
}

test('UI preflight keeps admin refresh auth coverage', () => {
  assertOrdered(
    [
      "await page.goto('/admin')",
      "const triggerMarketRefreshButton = page.getByRole('button', { name: 'Trigger market refresh' })",
      "await adminTokenInput.fill(invalidToken)",
      'const invalidRefreshRespPromise = page.waitForResponse',
      "resp.request().method() === 'POST' && resp.url().includes('/api/market/refresh')",
      'await triggerMarketRefreshButton.click()',
      'invalidRefreshResp.status() === 401 || invalidRefreshResp.status() === 403',
      'await adminTokenInput.fill(adminToken)',
      'const validRefreshRespPromise = page.waitForResponse',
      "resp.request().method() === 'POST' && resp.url().includes('/api/market/refresh')",
      'await triggerMarketRefreshButton.click()',
      'if (!validRefreshResp.ok())'
    ],
    'admin refresh checks must cover invalid-token rejection and valid-token success through the UI button'
  );
});

test('UI preflight keeps admin reload and save coverage after refresh checks', () => {
  assertOrdered(
    [
      'if (!validRefreshResp.ok())',
      'await pathwaysTextArea.fill',
      'await policiesTextArea.fill',
      'await reloadButton.click()',
      "hasText: 'Loaded pathways + policies'",
      'await savePathwaysButton.click()',
      'await savePoliciesButton.click()'
    ],
    'admin validation, reload, and save checks must remain after market refresh coverage'
  );
});

test('UI preflight keeps isolated test database and disabled background refresh', () => {
  assertContains(
    'JETSCOPE_DATABASE_URL: `sqlite+pysqlite:///${sqlitePath}`',
    'UI preflight must use an isolated per-attempt SQLite database'
  );
  assertContains(
    "JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS: '0'",
    'UI preflight must disable the background market refresh loop'
  );
  assertContains(
    "SAFVSOIL_MARKET_REFRESH_TIMEOUT_MS: '1500'",
    'UI preflight must bound market refresh latency for release-gate stability'
  );
});
