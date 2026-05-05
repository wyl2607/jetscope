export type IndustrySignalStatus = 'viable' | 'threshold' | 'watching' | 'far';

const SIGNAL_LABEL_KEYS: Record<IndustrySignalStatus, string> = {
  viable: 'industry.signal.viable',
  threshold: 'industry.signal.threshold',
  watching: 'industry.signal.watching',
  far: 'industry.signal.far'
};

const SIGNAL_THRESHOLDS: Array<{
  status: IndustrySignalStatus;
  maxGapUsdPerLiter: number;
  inclusiveMax?: boolean;
}> = [
  { status: 'viable', maxGapUsdPerLiter: 0, inclusiveMax: true },
  { status: 'threshold', maxGapUsdPerLiter: 0.3 },
  { status: 'watching', maxGapUsdPerLiter: 0.7 }
];

export function computeIndustrySignal(bestSafEffective: number, jetBenchmark: number): {
  status: IndustrySignalStatus;
  gapUsdPerLiter: number;
  labelKey: string;
} {
  const gapUsdPerLiter = bestSafEffective - jetBenchmark;
  const status = SIGNAL_THRESHOLDS.find(
    ({ inclusiveMax, maxGapUsdPerLiter }) =>
      gapUsdPerLiter < maxGapUsdPerLiter || (inclusiveMax === true && gapUsdPerLiter === maxGapUsdPerLiter)
  )?.status ?? 'far';

  return {
    status,
    gapUsdPerLiter,
    labelKey: SIGNAL_LABEL_KEYS[status]
  };
}

export function computePathwayReadiness(
  pathwayEffectiveCost: number,
  pathwayBaseCost: number,
  jetBenchmark: number
): number {
  if (pathwayEffectiveCost > pathwayBaseCost) {
    return 0;
  }

  if (pathwayEffectiveCost <= jetBenchmark) {
    return 100;
  }

  const gap = pathwayEffectiveCost - jetBenchmark;
  const maxGap = Math.max(pathwayBaseCost - 0.5, 0.01);
  const readiness = 100 - gap / maxGap * 100;

  return Math.max(0, Math.min(100, readiness));
}
