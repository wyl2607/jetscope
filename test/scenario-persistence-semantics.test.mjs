import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALTERNATE_MANUAL_STATE,
  BASE_MANUAL_STATE,
  SCENARIO_EXPECTATIONS,
  SCENARIO_PREFERENCE_FIELDS,
  createScenarioPayload,
  deleteScenario,
  hydrateScenarioSelection,
  saveScenario
} from './helpers/scenario-fixtures.mjs';

test('scenario payload shape captures editable inputs plus identity metadata only', () => {
  const payload = createScenarioPayload(
    {
      ...BASE_MANUAL_STATE,
      results: { cheapestRouteId: 'sugar-atj' },
      savedScenarios: [{ id: 'scenario-0', name: 'Old' }],
      serverPersistence: { exists: true }
    },
    {
      id: 'scenario-1',
      name: '  Summer parity  ',
      savedAt: '2026-04-16T13:00:00.000Z'
    }
  );

  assert.deepEqual(Object.keys(payload), SCENARIO_EXPECTATIONS.payloadFields);
  assert.equal(payload.name, 'Summer parity');
  assert.deepEqual(Object.keys(payload.preferences), SCENARIO_PREFERENCE_FIELDS);
  assert.deepEqual(payload.routeEdits, BASE_MANUAL_STATE.routeEdits);
  assert.equal('results' in payload, false);
  assert.match(SCENARIO_EXPECTATIONS.notes[0], /editable preferences and route edits/i);
});

test('saving by name overwrites the existing named scenario and preserves its id', () => {
  const existing = createScenarioPayload(BASE_MANUAL_STATE, {
    id: 'scenario-1',
    name: 'Parity window',
    savedAt: '2026-04-16T13:00:00.000Z'
  });

  const { scenarios, savedScenario } = saveScenario([existing], ALTERNATE_MANUAL_STATE, {
    name: 'Parity window',
    savedAt: '2026-04-16T14:00:00.000Z'
  });

  assert.equal(scenarios.length, 1);
  assert.equal(savedScenario.id, 'scenario-1');
  assert.equal(savedScenario.savedAt, '2026-04-16T14:00:00.000Z');
  assert.equal(savedScenario.name, 'Parity window');
  assert.deepEqual(savedScenario.preferences, ALTERNATE_MANUAL_STATE.preferences);
  assert.match(SCENARIO_EXPECTATIONS.notes[1], /overwrites/i);
});

test('saving by id overwrites the saved scenario even when the name changes', () => {
  const existing = createScenarioPayload(BASE_MANUAL_STATE, {
    id: 'scenario-2',
    name: 'Original thesis',
    savedAt: '2026-04-16T13:00:00.000Z'
  });

  const { scenarios, savedScenario } = saveScenario([existing], ALTERNATE_MANUAL_STATE, {
    id: 'scenario-2',
    name: 'CBAM upside',
    savedAt: '2026-04-16T15:00:00.000Z'
  });

  assert.equal(scenarios.length, 1);
  assert.equal(savedScenario.id, 'scenario-2');
  assert.equal(savedScenario.name, 'CBAM upside');
  assert.deepEqual(savedScenario.routeEdits, ALTERNATE_MANUAL_STATE.routeEdits);
});

test('explicit load hydrates the live draft from the saved scenario while preserving unrelated UI state', () => {
  const savedScenario = createScenarioPayload(ALTERNATE_MANUAL_STATE, {
    id: 'scenario-3',
    name: 'CBAM upside',
    savedAt: '2026-04-16T15:00:00.000Z'
  });

  const loaded = hydrateScenarioSelection(BASE_MANUAL_STATE, savedScenario);

  assert.equal(loaded.activeScenarioId, 'scenario-3');
  assert.deepEqual(loaded.preferences, savedScenario.preferences);
  assert.deepEqual(loaded.routeEdits, savedScenario.routeEdits);
  assert.deepEqual(loaded.ui, BASE_MANUAL_STATE.ui);
});

test('manual edits remain untouched until a saved scenario is explicitly loaded', () => {
  const untouched = hydrateScenarioSelection(BASE_MANUAL_STATE, null);

  assert.deepEqual(untouched.preferences, BASE_MANUAL_STATE.preferences);
  assert.deepEqual(untouched.routeEdits, BASE_MANUAL_STATE.routeEdits);
  assert.equal(untouched.activeScenarioId, null);
  assert.match(SCENARIO_EXPECTATIONS.notes[2], /until a saved scenario is explicitly loaded/i);
});

test('delete semantics remove scenarios by name or id without mutating the rest of the collection', () => {
  const parity = createScenarioPayload(BASE_MANUAL_STATE, {
    id: 'scenario-1',
    name: 'Parity window',
    savedAt: '2026-04-16T13:00:00.000Z'
  });
  const cbam = createScenarioPayload(ALTERNATE_MANUAL_STATE, {
    id: 'scenario-2',
    name: 'CBAM upside',
    savedAt: '2026-04-16T15:00:00.000Z'
  });

  const afterNameDelete = deleteScenario([parity, cbam], { name: 'Parity window' });
  assert.equal(afterNameDelete.deletedScenario?.id, 'scenario-1');
  assert.deepEqual(afterNameDelete.scenarios, [cbam]);

  const afterIdDelete = deleteScenario([parity, cbam], { id: 'scenario-2' });
  assert.equal(afterIdDelete.deletedScenario?.name, 'CBAM upside');
  assert.deepEqual(afterIdDelete.scenarios, [parity]);
});
