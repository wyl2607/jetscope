import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERSISTENCE_EXPECTATIONS,
  applyHydrationSemantics,
  getRoute,
  mergeEditableRouteSnapshot
} from './helpers/wave1-fixtures.mjs';

test('route refresh contract preserves editable fields for matching ids', () => {
  const currentRoutes = [
    { ...getRoute('sugar-atj'), baseCostUsdPerLiter: 1.91, co2SavingsKgPerLiter: 1.7 },
    { ...getRoute('reed-hefa'), baseCostUsdPerLiter: 2.11, co2SavingsKgPerLiter: 1.95 }
  ];
  const nextRoutes = [getRoute('sugar-atj'), getRoute('reed-hefa'), getRoute('cellulose-ft')];

  const merged = mergeEditableRouteSnapshot(currentRoutes, nextRoutes);

  assert.deepEqual(PERSISTENCE_EXPECTATIONS.editableRouteFields, [
    'baseCostUsdPerLiter',
    'co2SavingsKgPerLiter'
  ]);
  assert.equal(merged[0].baseCostUsdPerLiter, 1.91);
  assert.equal(merged[0].co2SavingsKgPerLiter, 1.7);
  assert.equal(merged[2].baseCostUsdPerLiter, getRoute('cellulose-ft').baseCostUsdPerLiter);
});

test('initial hydration applies defaults once and later refreshes keep user overrides', () => {
  const initialState = {
    hasHydrated: false,
    crudeSource: 'manual',
    carbonSource: 'manual',
    benchmarkMode: 'crude-proxy',
    subsidyUsdPerLiter: 0.5,
    jetProxySlope: 0.0082,
    jetProxyIntercept: 0.12
  };

  const firstPass = applyHydrationSemantics(initialState, {
    crudeSource: 'brentEia',
    carbonSource: 'cbamCarbonProxyUsd',
    benchmarkMode: 'live-jet-spot',
    subsidyUsdPerLiter: 0.5,
    jetProxySlope: 0.0082,
    jetProxyIntercept: 0.12
  });

  const userAdjusted = {
    ...firstPass,
    crudeSource: 'manual',
    carbonSource: 'manual',
    benchmarkMode: 'crude-proxy',
    subsidyUsdPerLiter: 0.77,
    jetProxySlope: 0.0091,
    jetProxyIntercept: 0.2
  };

  const secondPass = applyHydrationSemantics(userAdjusted, {
    crudeSource: 'brentFred',
    carbonSource: 'cbamCarbonProxyUsd',
    benchmarkMode: 'live-jet-spot',
    subsidyUsdPerLiter: 0.5,
    jetProxySlope: 0.0082,
    jetProxyIntercept: 0.12
  });

  assert.equal(firstPass.hasHydrated, true);
  assert.equal(firstPass.crudeSource, 'brentEia');
  assert.equal(firstPass.benchmarkMode, 'live-jet-spot');
  assert.equal(secondPass.crudeSource, 'manual');
  assert.equal(secondPass.carbonSource, 'manual');
  assert.equal(secondPass.benchmarkMode, 'crude-proxy');
  assert.equal(secondPass.subsidyUsdPerLiter, 0.77);
  assert.equal(secondPass.jetProxySlope, 0.0091);
  assert.match(PERSISTENCE_EXPECTATIONS.notes[1], /hydrate once/i);
});
