import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AviationCostError,
  computeCostChange,
  computeMarketLinkedFlightCost,
  energyTaxEurPerTFromEurPerL,
  type MarketLinkedFlightCostInput
} from '@/lib/aviation-cost';

function snakeToCamelInput(raw: Record<string, unknown>): MarketLinkedFlightCostInput {
  return {
    fossilJetUsdPerL: Number(raw.fossil_jet_usd_per_l),
    usdPerEur: Number(raw.usd_per_eur),
    fuelBurnT: Number(raw.fuel_burn_t),
    passengers: Number(raw.passengers),
    safUsdPerL: raw.saf_usd_per_l == null ? null : Number(raw.saf_usd_per_l),
    blendShare: Number(raw.blend_share ?? 0),
    etsApplicable: Boolean(raw.ets_applicable),
    quality: String(raw.quality)
  };
}

function sharedCostCases() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test/aviation-cost-shared.json');
  return JSON.parse(readFileSync(root, 'utf8')) as {
    jet_only_repro: { baseline: Record<string, unknown>; current: Record<string, unknown> };
    saf_and_fx: { baseline: Record<string, unknown>; current: Record<string, unknown> };
  };
}

const repro = {
  fossilJetUsdPerL: 1,
  usdPerEur: 1.25,
  fuelBurnT: 10,
  passengers: 100,
  euaEurPerT: 80,
  quality: 'derived'
};

describe('computeMarketLinkedFlightCost', () => {
  it('keeps the known 0% SAF total at 12528 EUR', () => {
    const result = computeMarketLinkedFlightCost({ ...repro, blendShare: 0 });
    expect(result.fuelAndComplianceEur).toBe(12528);
  });

  it('does not treat missing SAF as fossil jet when blend is 100%', () => {
    const result = computeMarketLinkedFlightCost({ ...repro, blendShare: 1 });
    expect(result.computable).toBe(false);
    expect(result.missingInputs).toContain('saf_usd_per_l');
    expect(result.fuelAndComplianceEur).toBeNull();
  });

  it('rejects a 200% blend instead of emitting negative carbon', () => {
    expect(() => computeMarketLinkedFlightCost({ ...repro, blendShare: 2 })).toThrow(AviationCostError);
  });

  it('converts the private energy-tax assumption from EUR/L to EUR/t', () => {
    expect(energyTaxEurPerTFromEurPerL(0.6545)).toBe(818.125);
  });
});

describe('computeCostChange', () => {
  it('keeps SAF blend jet-price drivers conservative for the shared repro', () => {
    const { baseline, current } = sharedCostCases().jet_only_repro;
    const delta = computeCostChange(snakeToCamelInput(baseline), snakeToCamelInput(current));
    const driverSum = Object.values(delta.driversEurPerFlight).reduce<number>(
      (sum, value) => sum + (typeof value === 'number' ? value : 0),
      0
    );
    expect(delta.fuelAndComplianceDeltaEur).toBeCloseTo(1000, 1);
    expect(driverSum).toBeCloseTo(delta.fuelAndComplianceDeltaEur ?? NaN, 1);
    expect(delta.driversEurPerFlight.saf).toBeDefined();
  });

  it('keeps SAF and FX drivers conservative on the shared fixture', () => {
    const { baseline, current } = sharedCostCases().saf_and_fx;
    const delta = computeCostChange(snakeToCamelInput(baseline), snakeToCamelInput(current));
    const driverSum = Object.values(delta.driversEurPerFlight).reduce<number>(
      (sum, value) => sum + (typeof value === 'number' ? value : 0),
      0
    );
    expect(delta.driversEurPerFlight.fx).not.toBe(0);
    expect(delta.driversEurPerFlight.saf).not.toBe(0);
    expect(driverSum).toBeCloseTo(delta.fuelAndComplianceDeltaEur ?? NaN, 1);
  });
});
