export function buildScenarioPayload(overrides = {}) {
  return {
    settings: {
      crudeSource: 'manual',
      carbonSource: 'manual',
      benchmarkMode: 'crude-proxy',
      crudeUsdPerBarrel: 103,
      carbonPriceUsdPerTonne: 90,
      subsidyUsdPerLiter: 0.5,
      jetProxySlope: 0.0082,
      jetProxyIntercept: 0.12,
      ...(overrides.settings ?? {})
    },
    routeEdits: {
      'sugar-atj': {
        baseCostUsdPerLiter: 1.6,
        co2SavingsKgPerLiter: 1.5
      },
      ...(overrides.routeEdits ?? {})
    }
  };
}

export const SCENARIO_PREFERENCE_FIELDS = [
  'crudeSource',
  'carbonSource',
  'benchmarkMode',
  'crudeUsdPerBarrel',
  'carbonPriceUsdPerTonne',
  'subsidyUsdPerLiter',
  'jetProxySlope',
  'jetProxyIntercept'
];

export const BASE_MANUAL_STATE = {
  preferences: buildScenarioPayload().settings,
  routeEdits: buildScenarioPayload().routeEdits,
  ui: {
    benchmarkLabel: 'crude proxy',
    sourceHealth: 'ok'
  },
  activeScenarioId: null
};

export const ALTERNATE_MANUAL_STATE = {
  preferences: buildScenarioPayload({
    settings: {
      crudeUsdPerBarrel: 82,
      carbonPriceUsdPerTonne: 145,
      subsidyUsdPerLiter: 0.72,
      jetProxySlope: 0.0094,
      jetProxyIntercept: 0.18
    },
    routeEdits: {
      'sugar-atj': {
        baseCostUsdPerLiter: 1.41,
        co2SavingsKgPerLiter: 1.8
      }
    }
  }).settings,
  routeEdits: buildScenarioPayload({
    routeEdits: {
      'sugar-atj': {
        baseCostUsdPerLiter: 1.41,
        co2SavingsKgPerLiter: 1.8
      }
    }
  }).routeEdits,
  ui: {
    benchmarkLabel: 'live jet spot',
    sourceHealth: 'degraded'
  },
  activeScenarioId: null
};

export function createScenarioPayload(state, { id, name, savedAt }) {
  return {
    id,
    name: name.trim(),
    savedAt,
    preferences: { ...state.preferences },
    routeEdits: JSON.parse(JSON.stringify(state.routeEdits))
  };
}

export function saveScenarioSnapshot(scenarios, { id, name, payload, savedAt = '2026-04-16T16:00:00.000Z' }) {
  const next = {
    id,
    name,
    savedAt,
    payload
  };
  return [next, ...scenarios.filter((scenario) => scenario.id !== id)].sort((left, right) =>
    right.savedAt.localeCompare(left.savedAt)
  );
}

export function deleteScenarioSnapshot(scenarios, id) {
  return scenarios.filter((scenario) => scenario.id !== id);
}

export function applyScenarioSnapshot({ shippedRoutes, currentState, scenario }) {
  return {
    ...currentState,
    ...scenario.payload.settings,
    routes: shippedRoutes.map((route) => ({
      ...route,
      ...(scenario.payload.routeEdits?.[route.id] ?? {})
    }))
  };
}

export const SCENARIO_EXPECTATIONS = {
  browserOnly: true,
  payloadFields: ['id', 'name', 'savedAt', 'preferences', 'routeEdits'],
  notes: [
    'Saving a scenario stores editable preferences and route edits only.',
    'Saving a scenario with the same name or id overwrites the previous saved snapshot, while explicit load remains the only action that should replace the current working state.',
    'Manual edits remain untouched until a saved scenario is explicitly loaded.',
    'Deleting a scenario only removes the saved snapshot; it must not mutate the current working state.'
  ]
};

export function saveScenario(scenarios, state, { id = null, name, savedAt }) {
  const existing = scenarios.find((scenario) => scenario.id === id || scenario.name === name);
  const savedScenario = createScenarioPayload(state, {
    id: existing?.id ?? id ?? `scenario-${scenarios.length + 1}`,
    name,
    savedAt
  });

  return {
    savedScenario,
    scenarios: [savedScenario, ...scenarios.filter((scenario) => scenario.id !== savedScenario.id)]
  };
}

export function hydrateScenarioSelection(state, scenario) {
  if (!scenario) {
    return {
      ...state,
      activeScenarioId: null
    };
  }

  return {
    ...state,
    activeScenarioId: scenario.id,
    preferences: { ...scenario.preferences },
    routeEdits: JSON.parse(JSON.stringify(scenario.routeEdits))
  };
}

export function deleteScenario(scenarios, { id = null, name = null }) {
  const deletedScenario = scenarios.find(
    (scenario) => (id && scenario.id === id) || (name && scenario.name === name)
  );
  return {
    deletedScenario: deletedScenario ?? null,
    scenarios: scenarios.filter(
      (scenario) =>
        !((id && scenario.id === id) || (name && scenario.name === name))
    )
  };
}
