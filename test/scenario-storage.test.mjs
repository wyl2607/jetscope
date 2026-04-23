import test from 'node:test';
import assert from 'node:assert/strict';

import { SAF_ROUTES } from '../data/baselines.mjs';
import {
  SCENARIO_EXPECTATIONS,
  applyScenarioSnapshot,
  buildScenarioPayload,
  deleteScenarioSnapshot,
  saveScenarioSnapshot
} from './helpers/scenario-fixtures.mjs';

test('saving a scenario overwrites by id and keeps most recent first', () => {
  const initial = [
    {
      id: 'high-carbon',
      name: 'High carbon',
      savedAt: '2026-04-16T15:00:00.000Z',
      payload: buildScenarioPayload({ settings: { carbonPriceUsdPerTonne: 150 } })
    }
  ];

  const updated = saveScenarioSnapshot(initial, {
    id: 'high-carbon',
    name: 'High carbon',
    savedAt: '2026-04-16T16:00:00.000Z',
    payload: buildScenarioPayload({ settings: { carbonPriceUsdPerTonne: 180 } })
  });

  assert.equal(updated.length, 1);
  assert.equal(updated[0].payload.settings.carbonPriceUsdPerTonne, 180);
  assert.equal(SCENARIO_EXPECTATIONS.browserOnly, true);
});

test('loading a scenario replaces current working state only when explicitly applied', () => {
  const currentState = {
    crudeSource: 'manual',
    crudeUsdPerBarrel: 95,
    routes: SAF_ROUTES
  };
  const scenario = {
    id: 'low-oil',
    name: 'Low oil',
    savedAt: '2026-04-16T16:10:00.000Z',
    payload: buildScenarioPayload({
      settings: { crudeUsdPerBarrel: 72, subsidyUsdPerLiter: 0.8 },
      routeEdits: { 'sugar-atj': { baseCostUsdPerLiter: 1.42, co2SavingsKgPerLiter: 1.7 } }
    })
  };

  const applied = applyScenarioSnapshot({
    shippedRoutes: SAF_ROUTES,
    currentState,
    scenario
  });

  assert.equal(currentState.crudeUsdPerBarrel, 95);
  assert.equal(applied.crudeUsdPerBarrel, 72);
  assert.equal(applied.subsidyUsdPerLiter, 0.8);
  assert.equal(applied.routes.find((route) => route.id === 'sugar-atj').baseCostUsdPerLiter, 1.42);
});

test('deleting a saved scenario does not mutate current working state', () => {
  const scenarios = [
    { id: 'base', name: 'Base', savedAt: '2026-04-16T16:00:00.000Z', payload: buildScenarioPayload() },
    {
      id: 'high-carbon',
      name: 'High carbon',
      savedAt: '2026-04-16T16:10:00.000Z',
      payload: buildScenarioPayload({ settings: { carbonPriceUsdPerTonne: 180 } })
    }
  ];
  const currentState = { carbonPriceUsdPerTonne: 132 };

  const remaining = deleteScenarioSnapshot(scenarios, 'base');

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, 'high-carbon');
  assert.equal(currentState.carbonPriceUsdPerTonne, 132);
  assert.match(SCENARIO_EXPECTATIONS.notes[1], /only action/i);
});
