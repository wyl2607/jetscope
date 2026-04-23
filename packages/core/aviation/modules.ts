export const CANONICAL_DASHBOARD_MODULES = [
  'CrisisKpiStrip',
  'FuelVsSafPriceChart',
  'SafPathwayComparisonTable',
  'TippingPointControls',
  'TippingPointStatus',
  'AirlineDecisionMatrix',
  'ScenarioCostStackChart',
  'SourceTrustPanel'
] as const;

export type CanonicalDashboardModule = (typeof CANONICAL_DASHBOARD_MODULES)[number];
