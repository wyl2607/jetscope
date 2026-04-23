import { POLICY_DEFAULTS, SAF_ROUTES } from '../../data/baselines.mjs';

export const DEFAULT_ROUTE_FIXTURE = {
  crudeUsdPerBarrel: 103,
  carbonPriceUsdPerTonne: POLICY_DEFAULTS.carbonPriceUsdPerTonne,
  subsidyUsdPerLiter: POLICY_DEFAULTS.subsidyUsdPerLiter,
  jetProxySlope: POLICY_DEFAULTS.jetProxySlope,
  jetProxyIntercept: POLICY_DEFAULTS.jetProxyIntercept,
  benchmarkMode: 'crude-proxy'
};

export const EDITABLE_ROUTE_FIELDS = ['baseCostUsdPerLiter', 'co2SavingsKgPerLiter'];

export function getRoute(id) {
  const route = SAF_ROUTES.find((item) => item.id === id);
  if (!route) {
    throw new Error(`Unknown route fixture: ${id}`);
  }
  return structuredClone(route);
}

export function computeRouteSnapshot(route, scenario = DEFAULT_ROUTE_FIXTURE) {
  const carbonCredit = (scenario.carbonPriceUsdPerTonne / 1000) * route.co2SavingsKgPerLiter;
  const effectiveCost = route.baseCostUsdPerLiter - carbonCredit - scenario.subsidyUsdPerLiter;
  const benchmarkPrice = scenario.jetProxySlope * scenario.crudeUsdPerBarrel + scenario.jetProxyIntercept;
  const breakEvenCrude = Math.max(
    0,
    (effectiveCost - scenario.jetProxyIntercept) / scenario.jetProxySlope
  );
  const delta = effectiveCost - benchmarkPrice;

  let competitiveness = '✗ 尚无竞争力';
  if (delta <= 0) competitiveness = '✓ 已具竞争力';
  else if (delta <= 0.25) competitiveness = '≈ 接近盈亏平衡';

  return {
    carbonCredit,
    effectiveCost,
    benchmarkPrice,
    breakEvenCrude,
    delta,
    competitiveness,
    costMultiple: benchmarkPrice > 0 ? effectiveCost / benchmarkPrice : Number.POSITIVE_INFINITY
  };
}

export function computeRouteSnapshotWithoutPolicy(route, scenario = DEFAULT_ROUTE_FIXTURE) {
  return computeRouteSnapshot(route, {
    ...scenario,
    carbonPriceUsdPerTonne: 0,
    subsidyUsdPerLiter: 0
  });
}

export function getBreakevenListRowsFixture(scenario = DEFAULT_ROUTE_FIXTURE) {
  return SAF_ROUTES.filter((route) => route.category === 'saf')
    .map((route) => ({
      route,
      withPolicy: computeRouteSnapshot(route, scenario),
      withoutPolicy: computeRouteSnapshotWithoutPolicy(route, scenario)
    }))
    .sort((left, right) => left.withPolicy.breakEvenCrude - right.withPolicy.breakEvenCrude);
}

export function selectCheapestSafRoute(scenario = DEFAULT_ROUTE_FIXTURE) {
  return SAF_ROUTES.filter((route) => route.category === 'saf')
    .map((route) => ({ route, snapshot: computeRouteSnapshot(route, scenario) }))
    .sort((left, right) => left.snapshot.effectiveCost - right.snapshot.effectiveCost)[0];
}

export function mergeEditableRouteSnapshot(currentRoutes, nextRoutes) {
  const currentById = new Map(
    currentRoutes.map((route) => [
      route.id,
      Object.fromEntries(EDITABLE_ROUTE_FIELDS.map((field) => [field, route[field]]))
    ])
  );

  return nextRoutes.map((route) => ({
    ...route,
    ...(currentById.get(route.id) ?? {})
  }));
}

export function applyHydrationSemantics(currentState, payloadDefaults) {
  if (currentState.hasHydrated) {
    return {
      ...currentState,
      hasHydrated: true
    };
  }

  return {
    ...currentState,
    crudeSource: payloadDefaults.crudeSource,
    carbonSource: payloadDefaults.carbonSource,
    benchmarkMode: payloadDefaults.benchmarkMode,
    subsidyUsdPerLiter: payloadDefaults.subsidyUsdPerLiter,
    jetProxySlope: payloadDefaults.jetProxySlope,
    jetProxyIntercept: payloadDefaults.jetProxyIntercept,
    hasHydrated: true
  };
}

export const PERSISTENCE_EXPECTATIONS = {
  editableRouteFields: EDITABLE_ROUTE_FIELDS,
  notes: [
    'Editable route fields persist across market-data refreshes by route id.',
    'Default sources and proxy controls hydrate once, then preserve user overrides on later refreshes.',
    'These expectations are intentionally captured as low-coupling contract fixtures so future extracted helpers can point at the same assertions.'
  ]
};
