import type { PathwayKey, SafPathway } from './entities.ts';

export const CANONICAL_PATHWAYS: Record<PathwayKey, SafPathway> = {
  hefa: {
    pathwayKey: 'hefa',
    displayName: 'HEFA',
    feedstockFamily: 'waste oils and fats',
    maturityLevel: 'commercial',
    costLowUsdPerL: 1.0,
    costHighUsdPerL: 1.5,
    carbonReductionLowPct: 60,
    carbonReductionHighPct: 85,
    sourceBasis: 'Phase 1 calibrated range'
  },
  atj: {
    pathwayKey: 'atj',
    displayName: 'ATJ',
    feedstockFamily: 'ethanol and isobutanol',
    maturityLevel: 'scaling',
    costLowUsdPerL: 1.3,
    costHighUsdPerL: 1.7,
    carbonReductionLowPct: 40,
    carbonReductionHighPct: 70,
    sourceBasis: 'Phase 1 calibrated range'
  },
  ft: {
    pathwayKey: 'ft',
    displayName: 'FT',
    feedstockFamily: 'biomass gasification',
    maturityLevel: 'limited',
    costLowUsdPerL: 1.5,
    costHighUsdPerL: 2.3,
    carbonReductionLowPct: 65,
    carbonReductionHighPct: 90,
    sourceBasis: 'Phase 1 calibrated range'
  },
  ptl: {
    pathwayKey: 'ptl',
    displayName: 'PtL / e-fuel',
    feedstockFamily: 'green hydrogen and captured carbon',
    maturityLevel: 'future',
    costLowUsdPerL: 3.0,
    costHighUsdPerL: 5.0,
    carbonReductionLowPct: 90,
    carbonReductionHighPct: 98,
    sourceBasis: 'Phase 1 calibrated range'
  }
};

export const CANONICAL_PATHWAY_ORDER: PathwayKey[] = ['hefa', 'atj', 'ft', 'ptl'];

export function getCanonicalPathway(pathwayKey: PathwayKey): SafPathway {
  return CANONICAL_PATHWAYS[pathwayKey];
}

export function listCanonicalPathways(): SafPathway[] {
  return CANONICAL_PATHWAY_ORDER.map((pathwayKey) => CANONICAL_PATHWAYS[pathwayKey]);
}
