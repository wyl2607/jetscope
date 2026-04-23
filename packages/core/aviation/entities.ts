export const MARKET_METRIC_KEYS = [
  'brent_usd_per_bbl',
  'jet_usd_per_l',
  'jet_eu_proxy_usd_per_l',
  'carbon_proxy_usd_per_t',
  'rotterdam_jet_fuel_usd_per_l',
  'eu_ets_price_eur_per_t',
  'germany_premium_pct'
] as const;

export type MarketMetricKey = (typeof MARKET_METRIC_KEYS)[number];

export const SOURCE_TYPES = ['official', 'market_primary', 'public_proxy', 'derived', 'manual'] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const RESERVE_STRESS_LEVELS = ['normal', 'watch', 'elevated', 'critical'] as const;

export type ReserveStressLevel = (typeof RESERVE_STRESS_LEVELS)[number];

export const PATHWAY_KEYS = ['hefa', 'atj', 'ft', 'ptl'] as const;

export type PathwayKey = (typeof PATHWAY_KEYS)[number];

export const PATHWAY_MATURITY_LEVELS = ['commercial', 'scaling', 'limited', 'future'] as const;

export type PathwayMaturityLevel = (typeof PATHWAY_MATURITY_LEVELS)[number];

export const TIPPING_POINT_STATUSES = ['competitive', 'inflection', 'premium'] as const;

export type TippingPointStatus = (typeof TIPPING_POINT_STATUSES)[number];

export const TIPPING_POINT_SIGNALS = [
  'saf_cost_advantaged',
  'switch_window_opening',
  'fossil_still_advantaged'
] as const;

export type TippingPointSignal = (typeof TIPPING_POINT_SIGNALS)[number];

export const AIRLINE_DECISION_SIGNALS = [
  'switch_window_opening',
  'capacity_stress_dominant',
  'incremental_adjustment'
] as const;

export type AirlineDecisionSignal = (typeof AIRLINE_DECISION_SIGNALS)[number];

export type MarketMetric = {
  metricKey: MarketMetricKey;
  label: string;
  unit: string;
  value: number;
  asOf: string;
  sourceType: SourceType;
  sourceName: string;
  confidenceScore: number;
  fallbackUsed: boolean;
  lagMinutes: number | null;
};

export type ReserveSignal = {
  region: string;
  coverageDays: number;
  coverageWeeks: number;
  stressLevel: ReserveStressLevel;
  estimatedSupplyGapPct: number;
  sourceType: SourceType;
  sourceName: string;
  confidenceScore: number;
};

export type SafPathway = {
  pathwayKey: PathwayKey;
  displayName: string;
  feedstockFamily: string;
  maturityLevel: PathwayMaturityLevel;
  costLowUsdPerL: number;
  costHighUsdPerL: number;
  carbonReductionLowPct: number;
  carbonReductionHighPct: number;
  sourceBasis: string;
};

export type PathwayTippingPoint = {
  pathwayKey: PathwayKey;
  displayName: string;
  netCostLowUsdPerL: number;
  netCostHighUsdPerL: number;
  spreadLowPct: number;
  spreadHighPct: number;
  status: TippingPointStatus;
};
