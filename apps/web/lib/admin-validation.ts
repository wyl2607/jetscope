const CRUDE_SOURCES = new Set(['manual', 'brentEia', 'brentFred']);
const CARBON_SOURCES = new Set(['manual', 'cbamCarbonProxyUsd']);
const BENCHMARK_MODES = new Set(['crude-proxy', 'live-jet-spot']);

function assertObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function parseJsonObject(raw: string, field: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {
    throw new Error(`${field} must be valid JSON`);
  }
  return assertObject(parsed, field);
}

function assertFiniteNumber(value: unknown, field: string): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
}

function assertEnum(value: unknown, field: string, allowed: Set<string>): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`${field} has unsupported value`);
  }
}

function assertNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function validatePreferences(preferences: Record<string, unknown>): Record<string, unknown> {
  const schemaVersion = preferences.schema_version;
  if (schemaVersion !== undefined) {
    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
      throw new Error('preferences.schema_version must be an integer >= 1');
    }
  }

  assertEnum(preferences.crudeSource, 'preferences.crudeSource', CRUDE_SOURCES);
  assertEnum(preferences.carbonSource, 'preferences.carbonSource', CARBON_SOURCES);
  assertEnum(preferences.benchmarkMode, 'preferences.benchmarkMode', BENCHMARK_MODES);

  assertFiniteNumber(preferences.crudeUsdPerBarrel, 'preferences.crudeUsdPerBarrel');
  assertFiniteNumber(preferences.carbonPriceUsdPerTonne, 'preferences.carbonPriceUsdPerTonne');
  assertFiniteNumber(preferences.subsidyUsdPerLiter, 'preferences.subsidyUsdPerLiter');
  assertFiniteNumber(preferences.jetProxySlope, 'preferences.jetProxySlope');
  assertFiniteNumber(preferences.jetProxyIntercept, 'preferences.jetProxyIntercept');

  return preferences;
}

function validateRouteEdits(routeEdits: Record<string, unknown>): Record<string, unknown> {
  for (const [routeId, edit] of Object.entries(routeEdits)) {
    if (!routeId.trim()) {
      throw new Error('route_edits key must be non-empty');
    }
    const row = assertObject(edit, `route_edits.${routeId}`);
    assertFiniteNumber(row.baseCostUsdPerLiter, `route_edits.${routeId}.baseCostUsdPerLiter`);
    assertFiniteNumber(row.co2SavingsKgPerLiter, `route_edits.${routeId}.co2SavingsKgPerLiter`);
    if (row.pathway !== undefined && typeof row.pathway !== 'string') {
      throw new Error(`route_edits.${routeId}.pathway must be a string`);
    }
    if (row.name !== undefined && typeof row.name !== 'string') {
      throw new Error(`route_edits.${routeId}.name must be a string`);
    }
  }
  return routeEdits;
}

function parseJsonArray(raw: string, field: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${field} must be valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${field} must be an array`);
  }
  return parsed;
}

export function validateScenarioPayload(preferencesRaw: string, routeEditsRaw: string): {
  preferences: Record<string, unknown>;
  route_edits: Record<string, unknown>;
} {
  const preferences = validatePreferences(parseJsonObject(preferencesRaw, 'preferences'));
  const routeEdits = validateRouteEdits(parseJsonObject(routeEditsRaw, 'route_edits'));
  return {
    preferences,
    route_edits: routeEdits
  };
}

export function validatePathwaysPayload(raw: string): unknown[] {
  const payload = parseJsonArray(raw, 'pathways');
  payload.forEach((item, index) => {
    const row = assertObject(item, `pathways[${index}]`);
    assertNonEmptyString(row.pathway_id, `pathways[${index}].pathway_id`);
    assertNonEmptyString(row.name, `pathways[${index}].name`);
    assertFiniteNumber(row.base_cost_usd_per_l, `pathways[${index}].base_cost_usd_per_l`);
    assertFiniteNumber(row.co2_savings_kg_per_l, `pathways[${index}].co2_savings_kg_per_l`);

    if (row.pathway === undefined || row.pathway === null || row.pathway === '') {
      row.pathway = String(row.name);
    } else {
      assertNonEmptyString(row.pathway, `pathways[${index}].pathway`);
    }

    if (row.category === undefined || row.category === null || row.category === '') {
      row.category = 'saf';
    } else {
      assertNonEmptyString(row.category, `pathways[${index}].category`);
    }
  });
  return payload;
}

export function validatePoliciesPayload(raw: string): unknown[] {
  const payload = parseJsonArray(raw, 'policies');
  payload.forEach((item, index) => {
    const row = assertObject(item, `policies[${index}]`);
    if (typeof row.year !== 'number' || !Number.isInteger(row.year)) {
      throw new Error(`policies[${index}].year must be an integer`);
    }
    assertFiniteNumber(row.saf_share_pct, `policies[${index}].saf_share_pct`);
    assertFiniteNumber(row.synthetic_share_pct, `policies[${index}].synthetic_share_pct`);
    assertNonEmptyString(row.label, `policies[${index}].label`);
  });
  return payload;
}
