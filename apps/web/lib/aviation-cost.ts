export const JET_FUEL_REFERENCE_DENSITY_KG_PER_L = 0.8;
export const KG_PER_METRIC_TON = 1000;
export const LITERS_PER_METRIC_TON_JET = KG_PER_METRIC_TON / JET_FUEL_REFERENCE_DENSITY_KG_PER_L;
export const LITERS_PER_BARREL = 158.987294928;
export const LITERS_PER_US_GALLON = 3.78541;
export const JET_CO2_T_PER_T_FUEL = 3.16;
export const MODEL_VERSION = 'aviation-cost-v1';

export class AviationCostError extends Error {}

function roundMoney(value: number, digits = 2): number { // figure-contract-lint-ignore: helper
  return Number(value.toFixed(digits));
}

export function usdPerLToUsdPerT(usdPerL: number): number { // figure-contract-lint-ignore: unit conversion
  if (!(usdPerL > 0)) throw new AviationCostError('jet price must be positive');
  return Number((usdPerL * LITERS_PER_METRIC_TON_JET).toFixed(4));
}

export function usdPerGalToUsdPerL(usdPerGal: number): number { // figure-contract-lint-ignore: unit conversion
  if (!(usdPerGal > 0)) throw new AviationCostError('gallon price must be positive');
  return Number((usdPerGal / LITERS_PER_US_GALLON).toFixed(6));
}

export function usdPerBblToUsdPerL(usdPerBbl: number): number { // figure-contract-lint-ignore: unit conversion
  if (!(usdPerBbl > 0)) throw new AviationCostError('barrel price must be positive');
  return Number((usdPerBbl / LITERS_PER_BARREL).toFixed(6));
}

export function kgToMetricTons(kg: number): number { // figure-contract-lint-ignore: unit conversion
  if (kg < 0) throw new AviationCostError('fuel mass cannot be negative');
  return kg / KG_PER_METRIC_TON;
}

export function computeMarketLinkedFlightCost(input: {
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
  airportQuoteAvailable?: boolean;
  quality?: string;
}): {
  modelVersion: string;
  label: string;
  notAnAirlineInvoice: true;
  usableForSignal: boolean;
  airportQuoteAvailable: boolean;
  deliveredEurPerT: number; // figure-contract-lint-ignore: returned to a labeled estimate panel
  fuelCostEur: number; // figure-contract-lint-ignore: returned to a labeled estimate panel
  carbonCostEur: number | null; // figure-contract-lint-ignore: returned to a labeled estimate panel
  fuelAndComplianceEur: number; // figure-contract-lint-ignore: returned to a labeled estimate panel
  perPassengerEur: number; // figure-contract-lint-ignore: returned to a labeled estimate panel
} {
  const blendShare = input.blendShare ?? 0.02;
  const airportDiff = input.airportDiffEurPerT ?? 0;
  const tax = input.applicableTaxEurPerT ?? 0;
  const etsCoverage = input.etsCoverage ?? 1;
  if (!(input.fuelBurnT > 0)) throw new AviationCostError('fuel burn must be positive');
  if (!(input.passengers > 0)) throw new AviationCostError('passenger count must be positive');
  if (!(input.usdPerEur > 0)) throw new AviationCostError('USD per EUR must be positive');

  const jetUsdPerT = usdPerLToUsdPerT(input.fossilJetUsdPerL);
  const safUsdPerT =
    input.safUsdPerL != null ? usdPerLToUsdPerT(input.safUsdPerL) : jetUsdPerT;
  const usdBlend = (1 - blendShare) * jetUsdPerT + blendShare * safUsdPerT;
  const delivered = usdBlend / input.usdPerEur + airportDiff + tax;
  const fuelCostEur = roundMoney(input.fuelBurnT * delivered);
  const carbonCostEur =
    input.euaEurPerT == null
      ? null
      : roundMoney(
          input.fuelBurnT * (1 - blendShare) * JET_CO2_T_PER_T_FUEL * input.euaEurPerT * etsCoverage
        );
  const fuelAndComplianceEur = roundMoney(fuelCostEur + (carbonCostEur ?? 0));
  const quality = input.quality ?? 'derived';

  return {
    modelVersion: MODEL_VERSION,
    label: 'market_linked_cost_estimate',
    notAnAirlineInvoice: true,
    usableForSignal: quality === 'observed' || quality === 'stale' || quality === 'derived',
    airportQuoteAvailable: Boolean(input.airportQuoteAvailable),
    deliveredEurPerT: Number(delivered.toFixed(4)),
    fuelCostEur,
    carbonCostEur,
    fuelAndComplianceEur,
    perPassengerEur: roundMoney(fuelAndComplianceEur / input.passengers)
  };
}
