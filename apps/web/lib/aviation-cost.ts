export const JET_FUEL_REFERENCE_DENSITY_KG_PER_L = 0.8;
export const KG_PER_METRIC_TON = 1000;
export const LITERS_PER_METRIC_TON_JET = KG_PER_METRIC_TON / JET_FUEL_REFERENCE_DENSITY_KG_PER_L;
export const LITERS_PER_BARREL = 158.987294928;
export const LITERS_PER_US_GALLON = 3.78541;
export const JET_CO2_T_PER_T_FUEL = 3.16;
export const MODEL_VERSION = 'aviation-cost-v2';
export const PRIVATE_JET_ENERGY_TAX_EUR_PER_L_ASSUMPTION = 0.6545;
const COST_SIGNAL_QUALITIES = new Set(['observed', 'stale', 'derived']);

export class AviationCostError extends Error {}

function roundMoney(value: number, digits = 2): number { // figure-contract-lint-ignore: helper
  return Number(value.toFixed(digits));
}

function requireFinite(
  value: unknown,
  name: string,
  { positive = false, nonNegative = false }: { positive?: boolean; nonNegative?: boolean } = {}
): number { // figure-contract-lint-ignore: validator
  if (typeof value === 'boolean' || value == null || typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AviationCostError(`${name} must be a finite number`);
  }
  if (positive && value <= 0) throw new AviationCostError(`${name} must be positive`);
  if (nonNegative && value < 0) throw new AviationCostError(`${name} cannot be negative`);
  return value;
}

function requirePositiveInt(value: unknown, name: string): number { // figure-contract-lint-ignore: validator
  const number = requireFinite(value, name, { positive: true });
  if (number !== Math.trunc(number)) throw new AviationCostError(`${name} must be a positive integer`);
  return Math.trunc(number);
}

function requireShare(value: unknown, name: string): number { // figure-contract-lint-ignore: validator
  const number = requireFinite(value, name, { nonNegative: true });
  if (number > 1) throw new AviationCostError(`${name} must be between 0 and 1`);
  return number;
}

export function usdPerLToUsdPerT(usdPerL: number): number { // figure-contract-lint-ignore: unit conversion
  return Number((requireFinite(usdPerL, 'jet price', { positive: true }) * LITERS_PER_METRIC_TON_JET).toFixed(4));
}

export function usdPerGalToUsdPerL(usdPerGal: number): number { // figure-contract-lint-ignore: unit conversion
  return Number((requireFinite(usdPerGal, 'gallon price', { positive: true }) / LITERS_PER_US_GALLON).toFixed(6));
}

export function usdPerBblToUsdPerL(usdPerBbl: number): number { // figure-contract-lint-ignore: unit conversion
  return Number((requireFinite(usdPerBbl, 'barrel price', { positive: true }) / LITERS_PER_BARREL).toFixed(6));
}

export function kgToMetricTons(kg: number): number { // figure-contract-lint-ignore: unit conversion
  return requireFinite(kg, 'fuel mass', { nonNegative: true }) / KG_PER_METRIC_TON;
}

export function energyTaxEurPerTFromEurPerL(
  eurPerL: number, // figure-contract-lint-ignore: unit conversion
  densityKgPerL = JET_FUEL_REFERENCE_DENSITY_KG_PER_L // figure-contract-lint-ignore: reference density
): number { // figure-contract-lint-ignore: unit conversion
  const perLitre = requireFinite(eurPerL, 'energy tax EUR/L', { nonNegative: true });
  const density = requireFinite(densityKgPerL, 'density', { positive: true });
  return Number((perLitre * (KG_PER_METRIC_TON / density)).toFixed(4));
}

export type MarketLinkedFlightCostInput = {
  fossilJetUsdPerL: number; // figure-contract-lint-ignore: calculator input, not a displayed Figure
  usdPerEur: number; // figure-contract-lint-ignore: calculator input, not a displayed Figure
  fuelBurnT: number; // figure-contract-lint-ignore: calculator input, not a displayed Figure
  passengers: number; // figure-contract-lint-ignore: passenger count is a scenario input
  safUsdPerL?: number | null; // figure-contract-lint-ignore: calculator input, not a displayed Figure
  blendShare?: number; // figure-contract-lint-ignore: scenario share, not a displayed Figure
  airportDiffEurPerT?: number; // figure-contract-lint-ignore: user assumption, not a displayed Figure
  applicableTaxEurPerT?: number; // figure-contract-lint-ignore: tax scenario input
  euaEurPerT?: number | null; // figure-contract-lint-ignore: calculator input, not a displayed Figure
  etsCoverage?: number; // figure-contract-lint-ignore: route coverage share
  etsApplicable?: boolean;
  safEtsEligibleShare?: number; // figure-contract-lint-ignore: ETS eligibility share
  airportQuoteAvailable?: boolean;
  quality?: string;
};

export type MarketLinkedFlightCost = {
  modelVersion: string;
  label: string;
  notAnAirlineInvoice: true;
  usableForSignal: boolean;
  computable: boolean;
  missingInputs: string[];
  airportQuoteAvailable: boolean;
  deliveredEurPerT: number | null; // figure-contract-lint-ignore: returned to a labeled estimate panel
  fuelCostEur: number | null; // figure-contract-lint-ignore: returned to a labeled estimate panel
  carbonCostEur: number | null; // figure-contract-lint-ignore: returned to a labeled estimate panel
  fuelAndComplianceEur: number | null; // figure-contract-lint-ignore: returned to a labeled estimate panel
  perPassengerEur: number | null; // figure-contract-lint-ignore: returned to a labeled estimate panel
  error?: string;
};

export function computeMarketLinkedFlightCost(input: MarketLinkedFlightCostInput): MarketLinkedFlightCost {
  const blendShare = requireShare(input.blendShare ?? 0, 'blend share');
  const airportDiff = requireFinite(input.airportDiffEurPerT ?? 0, 'airport differential');
  const tax = requireFinite(input.applicableTaxEurPerT ?? 0, 'applicable tax');
  const etsCoverage = requireFinite(input.etsCoverage ?? 1, 'ETS coverage', { nonNegative: true });
  const fuelBurnT = requireFinite(input.fuelBurnT, 'fuel burn', { positive: true });
  const passengers = requirePositiveInt(input.passengers, 'passenger count');
  const usdPerEur = requireFinite(input.usdPerEur, 'USD per EUR', { positive: true });
  const fossilJetUsdPerL = requireFinite(input.fossilJetUsdPerL, 'fossil jet price', { positive: true });
  const quality = input.quality ?? 'derived';
  const etsApplicable = input.etsApplicable ?? true;
  const eligible = requireShare(input.safEtsEligibleShare ?? 0, 'SAF ETS-eligible share');
  const missing: string[] = [];
  if (blendShare > 0 && input.safUsdPerL == null) missing.push('saf_usd_per_l');
  if (etsApplicable && input.euaEurPerT == null) missing.push('eua_eur_per_t');
  if (!COST_SIGNAL_QUALITIES.has(quality)) missing.push('usable_market_quote');

  const empty = (error?: string): MarketLinkedFlightCost => ({
    modelVersion: MODEL_VERSION,
    label: 'market_linked_cost_estimate',
    notAnAirlineInvoice: true,
    usableForSignal: false,
    computable: false,
    missingInputs: missing,
    airportQuoteAvailable: Boolean(input.airportQuoteAvailable),
    deliveredEurPerT: null,
    fuelCostEur: null,
    carbonCostEur: null,
    fuelAndComplianceEur: null,
    perPassengerEur: null,
    error
  });

  if (missing.includes('saf_usd_per_l') || missing.includes('usable_market_quote')) {
    return empty(missing.includes('saf_usd_per_l') ? 'SAF price required' : 'quote not usable');
  }

  const jetUsdPerT = usdPerLToUsdPerT(fossilJetUsdPerL);
  const safUsdPerT = input.safUsdPerL != null ? usdPerLToUsdPerT(input.safUsdPerL) : null;
  const usdBlend = (1 - blendShare) * jetUsdPerT + blendShare * (safUsdPerT ?? jetUsdPerT);
  const delivered = usdBlend / usdPerEur + airportDiff + tax;
  const fuelCostEur = roundMoney(fuelBurnT * delivered);
  const carbonCostEur = !etsApplicable
    ? 0
    : input.euaEurPerT == null
      ? null
      : roundMoney(
          fuelBurnT *
            (1 - eligible) *
            JET_CO2_T_PER_T_FUEL *
            requireFinite(input.euaEurPerT, 'EUA', { nonNegative: true }) *
            etsCoverage
        );
  const fuelAndComplianceEur = carbonCostEur == null ? null : roundMoney(fuelCostEur + carbonCostEur);

  return {
    modelVersion: MODEL_VERSION,
    label: 'market_linked_cost_estimate',
    notAnAirlineInvoice: true,
    usableForSignal: COST_SIGNAL_QUALITIES.has(quality),
    computable: carbonCostEur != null,
    missingInputs: missing,
    airportQuoteAvailable: Boolean(input.airportQuoteAvailable),
    deliveredEurPerT: Number(delivered.toFixed(4)),
    fuelCostEur,
    carbonCostEur,
    fuelAndComplianceEur,
    perPassengerEur: fuelAndComplianceEur == null ? null : roundMoney(fuelAndComplianceEur / passengers)
  };
}

export function computeCostChange(baseline: MarketLinkedFlightCostInput, current: MarketLinkedFlightCostInput): {
  fuelAndComplianceDeltaEur: number | null; // figure-contract-lint-ignore: labeled delta
  perPassengerDeltaEur: number | null; // figure-contract-lint-ignore: labeled delta
  driversEurPerFlight: Record<string, number | null>;
  sameFuelBurnAndPassengers: true;
} {
  const fuelBurnT = requireFinite(current.fuelBurnT, 'fuel burn', { positive: true });
  const passengers = requirePositiveInt(current.passengers, 'passenger count');
  const shared = { fuelBurnT, passengers };
  const run = (source: MarketLinkedFlightCostInput, overrides: Partial<MarketLinkedFlightCostInput> = {}) =>
    computeMarketLinkedFlightCost({ ...source, ...shared, ...overrides });
  const base = run(baseline);
  const curr = run(current);
  const jetBase = usdPerLToUsdPerT(baseline.fossilJetUsdPerL);
  const jetCurr = usdPerLToUsdPerT(current.fossilJetUsdPerL);
  const fxBase = baseline.usdPerEur;
  const fxCurr = current.usdPerEur;
  const oil = roundMoney(fuelBurnT * ((jetCurr - jetBase) / fxBase));
  const fx = roundMoney(fuelBurnT * (jetCurr / fxCurr - jetCurr / fxBase));
  const noCompliance = {
    airportDiffEurPerT: 0,
    applicableTaxEurPerT: 0,
    euaEurPerT: null,
    etsApplicable: false
  };
  const safBase = run(baseline, noCompliance);
  const safCurr = run(current, noCompliance);
  const fossilOnly = { ...noCompliance, blendShare: 0, safUsdPerL: null };
  const fossilBase = run(baseline, fossilOnly);
  const fossilCurr = run(current, fossilOnly);
  const saf =
    safBase.fuelCostEur == null ||
    safCurr.fuelCostEur == null ||
    fossilBase.fuelCostEur == null ||
    fossilCurr.fuelCostEur == null
      ? 0
      : roundMoney(
          safCurr.fuelCostEur - fossilCurr.fuelCostEur - (safBase.fuelCostEur - fossilBase.fuelCostEur)
        );
  const airport = roundMoney(
    fuelBurnT * ((current.airportDiffEurPerT ?? 0) - (baseline.airportDiffEurPerT ?? 0))
  );
  const tax = roundMoney(
    fuelBurnT * ((current.applicableTaxEurPerT ?? 0) - (baseline.applicableTaxEurPerT ?? 0))
  );
  const carbon =
    base.carbonCostEur == null || curr.carbonCostEur == null
      ? null
      : roundMoney(curr.carbonCostEur - base.carbonCostEur);
  const total =
    base.fuelAndComplianceEur == null || curr.fuelAndComplianceEur == null
      ? null
      : roundMoney(curr.fuelAndComplianceEur - base.fuelAndComplianceEur);
  const drivers: Record<string, number | null> = {
    jet_price: oil,
    fx,
    saf,
    airport_differential: airport,
    tax,
    carbon
  };
  let driverSum = roundMoney(
    Object.values(drivers).reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0)
  );
  let residual = total == null || carbon == null ? null : roundMoney(total - driverSum);
  if (residual != null && Math.abs(residual) <= 0.02) {
    residual = 0;
    driverSum = total ?? driverSum;
  }
  if (residual) drivers.residual = residual;
  return {
    fuelAndComplianceDeltaEur: total,
    perPassengerDeltaEur: total == null ? null : roundMoney(total / passengers),
    driversEurPerFlight: drivers,
    sameFuelBurnAndPassengers: true
  };
}
