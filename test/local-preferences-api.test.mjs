import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { startMockedServer } from './helpers/server-harness.mjs';

test('local preferences persist through API writes, market-data hydration, and restart', async () => {
  const localPreferencesFile = path.join(
    tmpdir(),
    `safvsoil-local-preferences-test-${process.pid}-${Date.now()}.json`
  );
  await rm(localPreferencesFile, { force: true });

  const firstServer = await startMockedServer({ localPreferencesFile });

  try {
    const putPayload = {
      preferences: {
        crudeSource: 'manual',
        carbonSource: 'manual',
        benchmarkMode: 'crude-proxy',
        carbonPriceUsdPerTonne: 145,
        subsidyUsdPerLiter: 0.72,
        jetProxySlope: 0.0091,
        jetProxyIntercept: 0.19
      },
      routeEdits: {
        'sugar-atj': {
          baseCostUsdPerLiter: 1.91,
          co2SavingsKgPerLiter: 1.7
        }
      }
    };

    const putResponse = await firstServer.fetchJson('/api/local-preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(putPayload)
    });
    assert.equal(putResponse.status, 200);
    assert.equal(putResponse.body.ok, true);
    assert.equal(putResponse.body.localPreferences.preferences.carbonPriceUsdPerTonne, 145);

    const preferencesResponse = await firstServer.fetchJson('/api/local-preferences');
    assert.equal(preferencesResponse.status, 200);
    assert.equal(preferencesResponse.body.preferences.benchmarkMode, 'crude-proxy');
    assert.equal(preferencesResponse.body.preferences.jetProxySlope, 0.0091);
    assert.equal(preferencesResponse.body.routeEdits['sugar-atj'].baseCostUsdPerLiter, 1.91);

    const marketDataResponse = await firstServer.fetchJson('/api/market-data');
    assert.equal(marketDataResponse.status, 200);
    assert.equal(marketDataResponse.body.defaults.benchmarkMode, 'crude-proxy');
    assert.equal(marketDataResponse.body.shippedDefaults.benchmarkMode, 'live-jet-spot');
    assert.equal(marketDataResponse.body.defaults.carbonPriceUsdPerTonne, 145);
    assert.equal(marketDataResponse.body.defaults.subsidyUsdPerLiter, 0.72);
    assert.equal(
      marketDataResponse.body.baselines.routes.find((route) => route.id === 'sugar-atj').baseCostUsdPerLiter,
      1.91
    );
    assert.equal(marketDataResponse.body.persistence.exists, true);
  } finally {
    await firstServer.close();
  }

  const restartedServer = await startMockedServer({ localPreferencesFile });

  try {
    const restartedPreferences = await restartedServer.fetchJson('/api/local-preferences');
    assert.equal(restartedPreferences.status, 200);
    assert.equal(restartedPreferences.body.preferences.carbonPriceUsdPerTonne, 145);
    assert.equal(restartedPreferences.body.routeEdits['sugar-atj'].co2SavingsKgPerLiter, 1.7);

    const resetResponse = await restartedServer.fetchJson('/api/reset-defaults', {
      method: 'POST'
    });
    assert.equal(resetResponse.status, 200);
    assert.equal(resetResponse.body.ok, true);
    assert.equal(resetResponse.body.reset, true);
    assert.equal(resetResponse.body.localPreferences.persistence.exists, false);

    const afterReset = await restartedServer.fetchJson('/api/local-preferences');
    assert.equal(afterReset.status, 200);
    assert.deepEqual(afterReset.body.preferences, {});
    assert.deepEqual(afterReset.body.routeEdits, {});
  } finally {
    await restartedServer.close();
    await rm(localPreferencesFile, { force: true });
  }
});

test('local preferences API rejects invalid JSON bodies', async () => {
  const server = await startMockedServer();

  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/local-preferences`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{"preferences":'
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Invalid JSON body');
  } finally {
    await server.close();
  }
});

test('local preferences API rejects oversized JSON bodies', async () => {
  const server = await startMockedServer();

  try {
    const largePayload = JSON.stringify({
      preferences: {
        benchmarkMode: 'crude-proxy'
      },
      routeEdits: {
        'sugar-atj': {
          baseCostUsdPerLiter: 1.9
        }
      },
      pad: 'x'.repeat(1024 * 1024)
    });

    const response = await fetch(`http://127.0.0.1:${server.port}/api/local-preferences`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: largePayload
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Request body too large');
  } finally {
    await server.close();
  }
});
