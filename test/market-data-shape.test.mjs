import test from 'node:test';
import assert from 'node:assert/strict';

import { startMockedServer } from './helpers/server-harness.mjs';

test('market-data endpoint returns the Wave 1 payload shape with mocked upstream sources', async () => {
  const server = await startMockedServer();

  try {
    const { status, body } = await server.fetchJson('/api/market-data');

    assert.equal(status, 200);
    assert.match(body.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(body.sources);
    assert.ok(body.defaults);
    assert.ok(body.shippedDefaults);
    assert.ok(body.baselines);
    assert.equal(body.defaults.crudeSource, 'brentEia');
    assert.equal(body.defaults.benchmarkMode, 'live-jet-spot');
    assert.equal(body.shippedDefaults.crudeSource, 'brentEia');
    assert.equal(body.sources.brentEia.status, 'ok');
    assert.equal(body.sources.jetFred.status, 'ok');
    assert.equal(body.sources.cbamCarbonProxyUsd.status, 'ok');
    assert.equal(body.sources.cbamCarbonProxyUsd.unit, 'USD/tCO₂');
    assert.equal(body.sources.jetFred.unit, 'USD/L');
    assert.equal(body.baselines.routes[0].id, 'jet-a');
    assert.equal(body.baselines.shippedRoutes[0].id, 'jet-a');
    assert.equal(body.baselines.refuelEuTargets.at(-1).year, 2050);
  } finally {
    await server.close();
  }
});
