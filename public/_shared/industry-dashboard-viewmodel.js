const INDUSTRY_BASELINE_AS_OF = '2026-Q1';

const INDUSTRY_COUNTRIES = [
  {
    id: 'eu',
    flag: '🇪🇺',
    nameZh: '欧盟 ReFuelEU',
    nameEn: 'EU ReFuelEU',
    currentPct: 0.7,
    target2030Pct: 2,
    policyType: 'mandate',
    policyStrength: 5,
    sourceNote: `ReFuelEU Aviation Art. 4 and delegated updates (as of ${INDUSTRY_BASELINE_AS_OF}).`
    ,
    verificationStatus: 'verified'
  },
  {
    id: 'de',
    flag: '🇩🇪',
    nameZh: '德国',
    nameEn: 'Germany',
    currentPct: 0.5,
    target2030Pct: 2,
    policyType: 'mandate',
    policyStrength: 4,
    sourceNote: `Estimate, needs verification: German implementation track aligned with EU ReFuelEU obligations (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'us',
    flag: '🇺🇸',
    nameZh: '美国',
    nameEn: 'United States',
    currentPct: 0.4,
    target2030Pct: 3,
    policyType: 'incentive',
    policyStrength: 3,
    sourceNote: `Estimate, needs verification: US SAF support relies on tax-credit and grant incentives (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'jp',
    flag: '🇯🇵',
    nameZh: '日本',
    nameEn: 'Japan',
    currentPct: 0.2,
    target2030Pct: 10,
    policyType: 'mandate',
    policyStrength: 4,
    sourceNote: `Estimate, needs verification: Japan airline SAF adoption roadmap toward 2030 policy target (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'nl',
    flag: '🇳🇱',
    nameZh: '荷兰 / SAF Hub',
    nameEn: 'Netherlands / SAF Hub',
    currentPct: 1.1,
    target2030Pct: 14,
    policyType: 'mandate',
    policyStrength: 5,
    sourceNote: `Estimate, needs verification: Dutch airport/fuel-supplier SAF hub planning under EU mandate path (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'cn',
    flag: '🇨🇳',
    nameZh: '中国',
    nameEn: 'China',
    currentPct: 0.1,
    target2030Pct: 5,
    policyType: 'planning',
    policyStrength: 2,
    sourceNote: `Estimate, needs verification: China SAF blend trajectory remains policy-planning led (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'sg',
    flag: '🇸🇬',
    nameZh: '新加坡',
    nameEn: 'Singapore',
    currentPct: 0.3,
    target2030Pct: 3,
    policyType: 'incentive',
    policyStrength: 3,
    sourceNote: `Estimate, needs verification: Singapore SAF deployment combines hub strategy and fiscal incentives (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'in',
    flag: '🇮🇳',
    nameZh: '印度',
    nameEn: 'India',
    currentPct: 0.05,
    target2030Pct: 1,
    policyType: 'early',
    policyStrength: 1,
    sourceNote: `Estimate, needs verification: India SAF requirement starts via phased pilot/early mandate steps (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  }
];

const INDUSTRY_AIRLINES = [
  {
    id: 'air-france-klm',
    name: 'Air France-KLM',
    alliance: 'SkyTeam',
    currentPct: 1.1,
    target2030Pct: 10,
    sourceNote: `Estimate, needs verification: Group sustainability pathway references 10% SAF ambition by 2030 (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'lufthansa',
    name: 'Lufthansa',
    alliance: 'Star',
    currentPct: 0.8,
    target2030Pct: 10,
    sourceNote: `Estimate, needs verification: Lufthansa Group SAF uptake track aligned with EU decarbonization milestones (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'british-airways',
    name: 'British Airways',
    alliance: 'OneWorld',
    currentPct: 0.7,
    target2030Pct: 10,
    sourceNote: `Estimate, needs verification: British Airways SAF usage and procurement targets through 2030 reporting (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'alaska-airlines',
    name: 'Alaska Airlines',
    alliance: 'OneWorld',
    currentPct: 0.68,
    target2030Pct: 10,
    sourceNote: `Estimate, needs verification: Alaska Airlines SAF roadmap and public 2030 commitments (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'united-airlines',
    name: 'United Airlines',
    alliance: 'Star',
    currentPct: 0.5,
    target2030Pct: 10,
    sourceNote: `Estimate, needs verification: United SAF deployment strategy with stated 2030 blend-direction target (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'singapore-airlines',
    name: 'Singapore Airlines',
    alliance: 'Star',
    currentPct: 0.5,
    target2030Pct: 5,
    sourceNote: `Estimate, needs verification: Singapore Airlines SAF adoption milestones tied to regional mandates (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'delta-air-lines',
    name: 'Delta Air Lines',
    alliance: 'SkyTeam',
    currentPct: 0.3,
    target2030Pct: 10,
    sourceNote: `Estimate, needs verification: Delta decarbonization disclosures indicate 2030 SAF scale-up objective (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  },
  {
    id: 'jetblue',
    name: 'JetBlue',
    alliance: 'Independent',
    currentPct: 0.3,
    target2030Pct: 5,
    sourceNote: `Estimate, needs verification: JetBlue SAF offtake and midpoint adoption target disclosures (as of ${INDUSTRY_BASELINE_AS_OF}).`,
    verificationStatus: 'estimate'
  }
];

const POLICY_MILESTONES = [
  {
    year: 2025,
    headlineZh: 'EU SAF 强制令生效',
    headlineEn: 'EU SAF mandate enters into force',
    detailZh: '欧盟机场 2% 掺混义务',
    detailEn: 'EU airports start with a 2% SAF blending obligation.',
    pctLabel: '2%',
    color: '--success'
  },
  {
    year: 2026,
    headlineZh: 'EU e-SAF 子目标启动',
    headlineEn: 'EU e-SAF sub-target starts',
    detailZh: '需含 0.7% 合成燃料',
    detailEn: 'A 0.7% synthetic fuel share becomes mandatory.',
    pctLabel: 'e0.7%',
    color: '--purple'
  },
  {
    year: 2027,
    headlineZh: '印度 SAF 试点强制',
    headlineEn: 'India launches SAF pilot mandate',
    detailZh: '国际航班 1% SAF',
    detailEn: 'International flights begin at a 1% SAF blend.',
    pctLabel: '1%',
    color: '--warning'
  },
  {
    year: 2030,
    headlineZh: '主要市场关键节点',
    headlineEn: 'Key 2030 milestone across major markets',
    detailZh: 'EU 6% · 美国 3B 加仑 · 日本 10%',
    detailEn: 'EU 6% · US 3B gallons · Japan 10% progression node.',
    pctLabel: '6%+',
    color: '--info'
  },
  {
    year: 2035,
    headlineZh: 'EU SAF 大幅提升',
    headlineEn: 'EU SAF requirement steps up sharply',
    detailZh: '欧盟 20% 掺混目标',
    detailEn: 'EU reaches a 20% SAF blending target.',
    pctLabel: '20%',
    color: '--warning'
  },
  {
    year: 2050,
    headlineZh: '净零航空目标',
    headlineEn: 'Net-zero aviation destination',
    detailZh: '欧盟 70% · 全行业净零',
    detailEn: 'EU 70% SAF trajectory and industry-wide net-zero endpoint.',
    pctLabel: '70%',
    color: '--danger'
  }
];

const INDUSTRY_SIGNAL_LABELS = {
  viable: { labelZh: '已具备经济可行性', labelEn: 'Economically viable now' },
  threshold: { labelZh: '接近经济门槛', labelEn: 'Near economic threshold' },
  watching: { labelZh: '需持续观察', labelEn: 'Needs close watch' },
  far: { labelZh: '距离较远', labelEn: 'Still far from parity' }
};

const INDUSTRY_STRENGTH_BADGES = {
  1: { level: 1, labelZh: '起步', labelEn: 'Early', color: 'var(--danger)' },
  2: { level: 2, labelZh: '规划', labelEn: 'Planning', color: 'var(--warning)' },
  3: { level: 3, labelZh: '激励', labelEn: 'Incentive', color: 'var(--info)' },
  4: { level: 4, labelZh: '执行中', labelEn: 'Executing', color: 'var(--accent)' },
  5: { level: 5, labelZh: '强制', labelEn: 'Mandated', color: 'var(--success)' }
};

const ROUTE_NAME_EN = {
  'jet-a': 'Traditional Jet Fuel',
  'sugar-atj': 'Sugar ATJ-SPK',
  'reed-hefa': 'Non-edible Reed / HEFA',
  'cellulose-ft': 'Cellulosic FT-SPK',
  'lignin-ft': 'Lignin HT Gasification FT',
  'hemicellulose-atj': 'Hemicellulose Furanics ATJ',
  'ptl-esaf': 'Green H₂ PtL e-SAF'
};

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseDateish(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== 'string' || !value) {
    return null;
  }

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  if (!match) {
    return null;
  }

  const fallback = new Date(match[0]);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function computeIndustrySignal(bestSafEffective, jetBenchmark) {
  const gapUsdPerLiter = bestSafEffective - jetBenchmark;
  let status = 'far';

  if (gapUsdPerLiter <= 0) {
    status = 'viable';
  } else if (gapUsdPerLiter < 0.3) {
    status = 'threshold';
  } else if (gapUsdPerLiter < 0.7) {
    status = 'watching';
  }

  return { status, gapUsdPerLiter };
}

function computePathwayReadiness(pathwayEffectiveCost, pathwayBaseCost, jetBenchmark) {
  if (pathwayEffectiveCost > pathwayBaseCost) {
    return 0;
  }

  if (pathwayEffectiveCost <= jetBenchmark) {
    return 100;
  }

  const gap = pathwayEffectiveCost - jetBenchmark;
  const maxGap = Math.max(pathwayBaseCost - 0.5, 0.01);
  const readiness = 100 - gap / maxGap * 100;

  return clamp(readiness, 0, 100);
}

function getProgressColor(progressPct) {
  if (progressPct >= 100) {
    return 'var(--success)';
  }
  if (progressPct >= 60) {
    return 'var(--accent)';
  }
  if (progressPct >= 35) {
    return 'var(--warning)';
  }
  return 'var(--danger)';
}

function getGapStatusColor(gapUsdPerLiter) {
  if (gapUsdPerLiter <= 0) {
    return 'var(--success)';
  }
  if (gapUsdPerLiter <= 0.25) {
    return 'var(--warning)';
  }
  return 'var(--danger)';
}

function getMarketYear(marketData) {
  const timestampDate = parseDateish(marketData?.timestamp);
  if (timestampDate) {
    return timestampDate.getFullYear();
  }

  const generatedDate = parseDateish(marketData?.generatedAt);
  if (generatedDate) {
    return generatedDate.getFullYear();
  }

  return null;
}

function getLiveJetSpot(state, marketData) {
  const source = marketData?.sources?.jetFred;
  return source?.status === 'ok' ? toFiniteNumber(source.value, null) : null;
}

function getBenchmarkPrice(state, marketData) {
  if (state.benchmarkMode === 'live-jet-spot') {
    const liveJet = getLiveJetSpot(state, marketData);
    if (liveJet != null) {
      return liveJet;
    }
  }

  return (
    toFiniteNumber(state.jetProxySlope, 0.0082) * toFiniteNumber(state.crudeUsdPerBarrel, 80) +
    toFiniteNumber(state.jetProxyIntercept, 0.12)
  );
}

function resolveRoutes(state, marketData) {
  if (Array.isArray(state.routes) && state.routes.length > 0) {
    return state.routes;
  }

  if (Array.isArray(marketData?.baselines?.routes) && marketData.baselines.routes.length > 0) {
    return marketData.baselines.routes;
  }

  return [];
}

function getSafSnapshots(state, marketData) {
  const benchmark = getBenchmarkPrice(state, marketData);
  const carbonPrice = toFiniteNumber(state.carbonPriceUsdPerTonne, 0);
  const subsidy = toFiniteNumber(state.subsidyUsdPerLiter, 0);

  return resolveRoutes(state, marketData)
    .filter((route) => route.category !== 'fossil')
    .map((route) => {
      const baseCostUsdPerLiter = toFiniteNumber(route.baseCostUsdPerLiter, 0);
      const co2SavingsKgPerLiter = toFiniteNumber(route.co2SavingsKgPerLiter, 0);
      const carbonCredit = (carbonPrice / 1000) * co2SavingsKgPerLiter;
      const effectiveCost = baseCostUsdPerLiter - carbonCredit - subsidy;

      return {
        route,
        withPolicy: {
          effectiveCost,
          delta: effectiveCost - benchmark
        }
      };
    })
    .sort((left, right) => left.withPolicy.effectiveCost - right.withPolicy.effectiveCost);
}

export function getIndustryDashboardViewModel(state = {}, marketData = state.marketData ?? null) {
  const sourceState = state ?? {};
  const sourceMarketData = marketData ?? sourceState.marketData ?? null;
  const jetBenchmarkUsdPerLiter = getBenchmarkPrice(sourceState, sourceMarketData);
  const safSnapshots = getSafSnapshots(sourceState, sourceMarketData);

  const bestSnapshot = safSnapshots[0] ?? null;
  const bestSafEffectiveUsdPerLiter =
    bestSnapshot?.withPolicy?.effectiveCost ?? Number.POSITIVE_INFINITY;
  const signal = computeIndustrySignal(bestSafEffectiveUsdPerLiter, jetBenchmarkUsdPerLiter);
  const signalLabel = INDUSTRY_SIGNAL_LABELS[signal.status] ?? INDUSTRY_SIGNAL_LABELS.far;
  const marketYear = getMarketYear(sourceMarketData);
  const bestSafRouteId = bestSnapshot?.route?.id ?? null;

  return {
    baselineAsOf: INDUSTRY_BASELINE_AS_OF,
    signal: {
      status: signal.status,
      gapUsdPerLiter: signal.gapUsdPerLiter,
      labelZh: signalLabel.labelZh,
      labelEn: signalLabel.labelEn,
      jetBenchmarkUsdPerLiter,
      bestSafEffectiveUsdPerLiter,
      bestSafRouteId
    },
    bestSafRouteId,
    countries: INDUSTRY_COUNTRIES.map((country) => {
      const progressPct =
        country.target2030Pct > 0
          ? clamp((country.currentPct / country.target2030Pct) * 100, 0, 100)
          : 0;
      const strengthBadge =
        INDUSTRY_STRENGTH_BADGES[country.policyStrength] ?? INDUSTRY_STRENGTH_BADGES[1];

      return {
        ...country,
        progressPct,
        progressColor: getProgressColor(progressPct),
        strengthBadge
      };
    }),
    airlines: INDUSTRY_AIRLINES.map((airline) => {
      const progressPct =
        airline.target2030Pct > 0
          ? clamp((airline.currentPct / airline.target2030Pct) * 100, 0, 100)
          : 0;
      return {
        ...airline,
        progressPct,
        progressColor: getProgressColor(progressPct)
      };
    }),
    pathways: safSnapshots.map(({ route, withPolicy }) => {
      const gapUsdPerLiter = withPolicy.effectiveCost - jetBenchmarkUsdPerLiter;
      return {
        routeId: route.id,
        nameZh: route.name,
        nameEn: route.nameEn ?? ROUTE_NAME_EN[route.id] ?? route.name,
        readiness: computePathwayReadiness(
          withPolicy.effectiveCost,
          toFiniteNumber(route.baseCostUsdPerLiter, 0),
          jetBenchmarkUsdPerLiter
        ),
        gapUsdPerLiter,
        statusColor: getGapStatusColor(gapUsdPerLiter)
      };
    }),
    timeline: POLICY_MILESTONES.map((milestone, idx) => {
      const isPast = marketYear == null ? false : milestone.year < marketYear;
      const isCurrent = marketYear == null ? false : milestone.year === marketYear;
      return {
        ...milestone,
        isPast,
        isCurrent
      };
    })
  };
}
