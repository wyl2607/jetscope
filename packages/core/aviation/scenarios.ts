import type { AirlineDecisionSignal, PathwayKey, TippingPointSignal } from './entities.ts';

export type TippingPointScenario = {
  fossilJetUsdPerL: number;
  carbonPriceEurPerT: number;
  subsidyUsdPerL: number;
  blendRatePct: number;
  reserveWeeks: number;
  selectedPathwayKey: PathwayKey;
};

export type TippingPointResult = {
  generatedAt: string;
  signal: TippingPointSignal;
  effectiveFossilJetUsdPerL: number;
};

export type AirlineDecisionProbabilities = {
  raiseFares: number;
  cutCapacity: number;
  buySpotSaf: number;
  signLongTermOfftake: number;
  groundRoutes: number;
};

export type AirlineDecisionResult = {
  generatedAt: string;
  signal: AirlineDecisionSignal;
  probabilities: AirlineDecisionProbabilities;
};

export type SavedScenarioCompatibilityRecord = {
  id: string;
  name: string;
  legacyRouteEdits?: Record<string, unknown>;
  legacyPreferences?: Record<string, unknown>;
};
