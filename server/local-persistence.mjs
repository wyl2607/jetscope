import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { POLICY_DEFAULTS, SAF_ROUTES } from '../data/baselines.mjs';

const PERSISTENCE_VERSION = 1;
const DEFAULT_FILE_BASENAME = 'local-preferences.json';

const ALLOWED_CRUDE_SOURCES = new Set(['manual', 'brentEia', 'brentFred']);
const ALLOWED_CARBON_SOURCES = new Set(['manual', 'cbamCarbonProxyUsd']);
const ALLOWED_BENCHMARK_MODES = new Set(['crude-proxy', 'live-jet-spot']);
const EDITABLE_ROUTE_BASELINES = new Map(
  SAF_ROUTES.filter((route) => route.category === 'saf').map((route) => [route.id, route])
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptyDocument() {
  return {
    version: PERSISTENCE_VERSION,
    savedAt: null,
    preferences: {},
    routeEdits: {}
  };
}

function normalizeFiniteNumber(value, label, { min = Number.NEGATIVE_INFINITY } = {}) {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new Error(`${label} must be a finite number${Number.isFinite(min) ? ` >= ${min}` : ''}`);
  }

  return value;
}

function normalizeEnum(value, allowedValues, label) {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== 'string' || !allowedValues.has(value)) {
    throw new Error(`${label} must be one of: ${Array.from(allowedValues).join(', ')}`);
  }

  return value;
}

function normalizeRouteEdits(routeEdits) {
  if (routeEdits == null) {
    return {};
  }

  if (typeof routeEdits !== 'object' || Array.isArray(routeEdits)) {
    throw new Error('routeEdits must be an object keyed by route id');
  }

  const normalized = {};

  for (const [routeId, patch] of Object.entries(routeEdits)) {
    const baseline = EDITABLE_ROUTE_BASELINES.get(routeId);
    if (!baseline) {
      throw new Error(`routeEdits contains unsupported route id: ${routeId}`);
    }

    if (typeof patch !== 'object' || patch == null || Array.isArray(patch)) {
      throw new Error(`routeEdits.${routeId} must be an object`);
    }

    const allowedPatchKeys = new Set(['baseCostUsdPerLiter', 'co2SavingsKgPerLiter']);
    for (const key of Object.keys(patch)) {
      if (!allowedPatchKeys.has(key)) {
        throw new Error(`routeEdits.${routeId}.${key} is not supported`);
      }
    }

    const nextPatch = {};
    const nextBaseCost = normalizeFiniteNumber(
      patch.baseCostUsdPerLiter,
      `routeEdits.${routeId}.baseCostUsdPerLiter`,
      { min: 0 }
    );
    const nextCo2 = normalizeFiniteNumber(
      patch.co2SavingsKgPerLiter,
      `routeEdits.${routeId}.co2SavingsKgPerLiter`,
      { min: 0 }
    );

    if (nextBaseCost != null && nextBaseCost !== baseline.baseCostUsdPerLiter) {
      nextPatch.baseCostUsdPerLiter = nextBaseCost;
    }

    if (nextCo2 != null && nextCo2 !== baseline.co2SavingsKgPerLiter) {
      nextPatch.co2SavingsKgPerLiter = nextCo2;
    }

    if (Object.keys(nextPatch).length > 0) {
      normalized[routeId] = nextPatch;
    }
  }

  return normalized;
}

function normalizePreferences(preferences) {
  if (preferences == null) {
    return {};
  }

  if (typeof preferences !== 'object' || Array.isArray(preferences)) {
    throw new Error('preferences must be an object');
  }

  const allowedKeys = new Set([
    'crudeSource',
    'carbonSource',
    'benchmarkMode',
    'carbonPriceUsdPerTonne',
    'subsidyUsdPerLiter',
    'jetProxySlope',
    'jetProxyIntercept'
  ]);

  for (const key of Object.keys(preferences)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`preferences.${key} is not supported`);
    }
  }

  const normalized = {};

  const crudeSource = normalizeEnum(preferences.crudeSource, ALLOWED_CRUDE_SOURCES, 'preferences.crudeSource');
  if (crudeSource != null) {
    normalized.crudeSource = crudeSource;
  }

  const carbonSource = normalizeEnum(
    preferences.carbonSource,
    ALLOWED_CARBON_SOURCES,
    'preferences.carbonSource'
  );
  if (carbonSource != null) {
    normalized.carbonSource = carbonSource;
  }

  const benchmarkMode = normalizeEnum(
    preferences.benchmarkMode,
    ALLOWED_BENCHMARK_MODES,
    'preferences.benchmarkMode'
  );
  if (benchmarkMode != null) {
    normalized.benchmarkMode = benchmarkMode;
  }

  const carbonPriceUsdPerTonne = normalizeFiniteNumber(
    preferences.carbonPriceUsdPerTonne,
    'preferences.carbonPriceUsdPerTonne',
    { min: 0 }
  );
  if (carbonPriceUsdPerTonne != null) {
    normalized.carbonPriceUsdPerTonne = carbonPriceUsdPerTonne;
  }

  const subsidyUsdPerLiter = normalizeFiniteNumber(
    preferences.subsidyUsdPerLiter,
    'preferences.subsidyUsdPerLiter',
    { min: 0 }
  );
  if (subsidyUsdPerLiter != null) {
    normalized.subsidyUsdPerLiter = subsidyUsdPerLiter;
  }

  const jetProxySlope = normalizeFiniteNumber(preferences.jetProxySlope, 'preferences.jetProxySlope', {
    min: 0
  });
  if (jetProxySlope != null) {
    normalized.jetProxySlope = jetProxySlope;
  }

  const jetProxyIntercept = normalizeFiniteNumber(
    preferences.jetProxyIntercept,
    'preferences.jetProxyIntercept',
    { min: 0 }
  );
  if (jetProxyIntercept != null) {
    normalized.jetProxyIntercept = jetProxyIntercept;
  }

  return normalized;
}

function buildSourceLocks(preferences = {}) {
  const crudeSource = preferences.crudeSource ?? 'manual';
  const carbonSource = preferences.carbonSource ?? 'manual';

  return {
    crude: {
      selected: crudeSource,
      locked: crudeSource !== 'manual'
    },
    carbon: {
      selected: carbonSource,
      locked: carbonSource !== 'manual'
    }
  };
}

function normalizeDocumentShape(input, { tolerateInvalid = false } = {}) {
  try {
    if (typeof input !== 'object' || input == null || Array.isArray(input)) {
      throw new Error('Persistence document must be an object');
    }

    const document = createEmptyDocument();
    document.preferences = normalizePreferences(input.preferences);
    document.routeEdits = normalizeRouteEdits(input.routeEdits);
    document.savedAt =
      typeof input.savedAt === 'string' && !Number.isNaN(Date.parse(input.savedAt)) ? input.savedAt : null;
    document.version =
      typeof input.version === 'number' && Number.isInteger(input.version) && input.version > 0
        ? input.version
        : PERSISTENCE_VERSION;
    return document;
  } catch (error) {
    if (!tolerateInvalid) {
      throw error;
    }

    return {
      ...createEmptyDocument(),
      warning: error instanceof Error ? error.message : String(error)
    };
  }
}

export function getLocalPreferencesFile(projectRoot) {
  return process.env.SAFVSOIL_LOCAL_PREFERENCES_FILE || path.join(projectRoot, 'data', DEFAULT_FILE_BASENAME);
}

export async function loadLocalPreferences(projectRoot) {
  const filePath = getLocalPreferencesFile(projectRoot);

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const document = normalizeDocumentShape(parsed, { tolerateInvalid: true });

    return {
      filePath,
      exists: true,
      ...document
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        filePath,
        exists: false,
        ...createEmptyDocument()
      };
    }

    if (error instanceof SyntaxError) {
      return {
        filePath,
        exists: true,
        ...createEmptyDocument(),
        warning: 'Persistence file contained invalid JSON and was ignored.'
      };
    }

    throw error;
  }
}

async function writeDocument(filePath, document) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  await writeFile(tmpPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await rename(tmpPath, filePath);
}

export async function saveLocalPreferences(projectRoot, nextDocument) {
  const filePath = getLocalPreferencesFile(projectRoot);
  const normalized = normalizeDocumentShape(nextDocument);
  const document = {
    ...normalized,
    version: PERSISTENCE_VERSION,
    savedAt: new Date().toISOString()
  };

  await writeDocument(filePath, document);

  return {
    filePath,
    exists: true,
    ...clone(document)
  };
}

export async function resetLocalPreferences(projectRoot) {
  const filePath = getLocalPreferencesFile(projectRoot);
  await rm(filePath, { force: true });

  return {
    filePath,
    exists: false,
    ...createEmptyDocument()
  };
}

export function applyLocalPreferencesToMarketData(marketData, localPreferences) {
  const next = clone(marketData);
  const sourceLocks = buildSourceLocks(localPreferences.preferences);
  const shippedDefaults = clone(marketData.defaults ?? {});
  const shippedRoutes = clone(marketData.baselines?.routes ?? []);

  next.defaults = {
    ...next.defaults,
    ...localPreferences.preferences
  };

  const routeEditsById = localPreferences.routeEdits ?? {};
  next.baselines = next.baselines ?? {};
  next.shippedDefaults = shippedDefaults;
  next.baselines.shippedRoutes = shippedRoutes;
  next.baselines.routes = (next.baselines.routes ?? []).map((route) => ({
    ...route,
    ...(routeEditsById[route.id] ?? {})
  }));

  next.persistence = {
    mode: 'local-file',
    scope: 'server-local-only',
    file: path.relative(process.cwd(), localPreferences.filePath),
    exists: localPreferences.exists,
    savedAt: localPreferences.savedAt,
    warning: localPreferences.warning,
    sourceLocks,
    routeEditCount: Object.keys(routeEditsById).length,
    semantics: {
      persistedPreferences: [
        'crudeSource',
        'carbonSource',
        'benchmarkMode',
        'carbonPriceUsdPerTonne',
        'subsidyUsdPerLiter',
        'jetProxySlope',
        'jetProxyIntercept'
      ],
      persistedRouteFields: ['baseCostUsdPerLiter', 'co2SavingsKgPerLiter'],
      reset: 'DELETE /api/local-preferences or POST /api/reset-defaults',
      writeMode: 'PUT /api/local-preferences fully replaces the persisted document'
    }
  };

  return next;
}

export function buildLocalPreferencesResponse(localPreferences) {
  const sourceLocks = buildSourceLocks(localPreferences.preferences);

  return {
    version: localPreferences.version ?? PERSISTENCE_VERSION,
    savedAt: localPreferences.savedAt,
    preferences: clone(localPreferences.preferences ?? {}),
    routeEdits: clone(localPreferences.routeEdits ?? {}),
    sourceLocks,
    fallbackDefaults: {
      crudeSource: 'manual',
      carbonSource: 'manual',
      benchmarkMode: 'crude-proxy',
      carbonPriceUsdPerTonne: POLICY_DEFAULTS.carbonPriceUsdPerTonne,
      subsidyUsdPerLiter: POLICY_DEFAULTS.subsidyUsdPerLiter,
      jetProxySlope: POLICY_DEFAULTS.jetProxySlope,
      jetProxyIntercept: POLICY_DEFAULTS.jetProxyIntercept
    },
    persistence: {
      mode: 'local-file',
      scope: 'server-local-only',
      exists: localPreferences.exists,
      file: path.relative(process.cwd(), localPreferences.filePath),
      warning: localPreferences.warning,
      routeEditCount: Object.keys(localPreferences.routeEdits ?? {}).length,
      semantics: {
        putReplacesDocument: true,
        omittedFieldsClearSavedValue: true,
        nullFieldsAreIgnoredAndThereforeClearedOnReplace: true,
        unchangedRoutesAreDropped: true,
        sourceSelectionIsStoredViaPreferences: ['crudeSource', 'carbonSource']
      }
    }
  };
}
