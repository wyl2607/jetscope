export const SAF_ROUTES = [
  {
    id: 'jet-a',
    name: 'Jet-A / Kerosene',
    pathway: 'Traditional fossil aviation fuel',
    baseCostUsdPerLiter: 0.7,
    baseCostRange: [0.5, 0.8],
    co2SavingsKgPerLiter: 0,
    color: '#6b7280',
    category: 'fossil'
  },
  {
    id: 'sugar-atj',
    name: '糖基 ATJ-SPK',
    pathway: 'Sugar → Ethanol → Jet',
    baseCostUsdPerLiter: 1.6,
    baseCostRange: [1.3, 2.0],
    co2SavingsKgPerLiter: 1.5,
    color: '#16a34a',
    category: 'saf'
  },
  {
    id: 'reed-hefa',
    name: '不可食用芦苇 / 植物 HEFA',
    pathway: 'Reed / Carinata → HEFA',
    baseCostUsdPerLiter: 1.85,
    baseCostRange: [1.55, 2.25],
    co2SavingsKgPerLiter: 1.8,
    color: '#0f766e',
    category: 'saf'
  },
  {
    id: 'cellulose-ft',
    name: '纤维素 FT-SPK',
    pathway: 'Cellulose → Gasification → FT',
    baseCostUsdPerLiter: 2.3,
    baseCostRange: [2.0, 2.7],
    co2SavingsKgPerLiter: 2.0,
    color: '#2563eb',
    category: 'saf'
  },
  {
    id: 'lignin-ft',
    name: '木质素高温气化 FT',
    pathway: 'Lignin → HT Gasification → FT',
    baseCostUsdPerLiter: 2.65,
    baseCostRange: [2.35, 3.05],
    co2SavingsKgPerLiter: 2.1,
    color: '#7c3aed',
    category: 'saf'
  },
  {
    id: 'hemicellulose-atj',
    name: '半纤维素呋喃烃 ATJ',
    pathway: 'Hemicellulose → Furanics → ATJ',
    baseCostUsdPerLiter: 3.1,
    baseCostRange: [2.8, 3.5],
    co2SavingsKgPerLiter: 2.0,
    color: '#db2777',
    category: 'saf'
  },
  {
    id: 'ptl-esaf',
    name: '绿氢 PtL e-SAF',
    pathway: 'CO₂ + H₂ → FT (Power-to-Liquid)',
    baseCostUsdPerLiter: 4.5,
    baseCostRange: [4.2, 4.9],
    co2SavingsKgPerLiter: 2.4,
    color: '#f59e0b',
    category: 'saf'
  }
];

export const POLICY_DEFAULTS = {
  carbonPriceUsdPerTonne: 90,
  subsidyUsdPerLiter: 0.5,
  jetProxySlope: 0.0082,
  jetProxyIntercept: 0.12
};

// Oil price ranges: historical context + current positioning
export const OIL_PRICE_CONTEXT = {
  // Historical data (2015-2024)
  historicalRanges: {
    low: { value: 35, label: '2020 极端低（疫情）', year: 2020 },
    mid: { value: 60, label: '2015-2019 平均', year: '2015-2019' },
    high: { value: 145, label: '2008 历史高', year: 2008 }
  },
  // Current status (2026)
  current: {
    baselineUsdPerBarrel: 80,
    label: '2026 基准（Goldman Sachs）'
  },
  // Forecast cone (Goldman Sachs 2026-2027)
  forecasts: {
    base2026: { value: 80, range: [75, 85], label: '2026 基准' },
    base2027: { value: 82, range: [75, 90], label: '2027 基准' },
    optimistic: { value: 100, label: '乐观情景（地缘政治）' },
    pessimistic: { value: 60, label: '悲观情景（需求崩塌）' }
  },
  // Parity calculation ranges
  parityRanges: {
    jetFuelAt60: 0.62,      // At $60/bbl
    jetFuelAt80: 0.78,      // At $80/bbl (current)
    jetFuelAt100: 0.94,     // At $100/bbl
    jetFuelAt120: 1.10      // At $120/bbl
  },
  // SAF breakeven thresholds (when P_SAF_effective <= P_jet)
  safBreakeven: {
    sugarAtj: {
      oilPriceNeededUsdPerBbl: 115,
      label: '糖基 ATJ 需要 $115 油价'
    },
    reedhefa: {
      oilPriceNeededUsdPerBbl: 130,
      label: '植物 HEFA 需要 $130 油价'
    },
    celluloseFt: {
      oilPriceNeededUsdPerBbl: 160,
      label: '纤维素 FT 需要 $160 油价'
    }
  }
};

// Carbon price trajectory (EU ETS + policy forecasts)
export const CARBON_PRICE_TRAJECTORY = {
  current: { value: 90, year: 2026, label: 'Current EU ETS' },
  near: { value: 120, year: 2030, label: 'EU 2030 forecast' },
  mid: { value: 160, year: 2035, label: 'Mid-term policy' },
  far: { value: 200, year: 2040, label: 'Long-term climate' }
};

// Subsidy stratification (actual 2026 data by region/pathway)
export const SUBSIDY_STRATIFICATION = {
  us_ira_credit: { range: [0.33, 0.46], label: 'US IRA tax credit ($/L)' },
  eu_implicit_hefa: { range: [0.20, 0.40], label: 'EU HEFA implicit subsidy' },
  eu_implicit_atj: { range: [0.30, 0.60], label: 'EU ATJ implicit subsidy' },
  eu_direct_future: { range: [0.50, 1.00], label: 'EU potential direct subsidy (post-2026)' }
};

// Historical Brent prices (2015-2025) for context and backtest
export const HISTORICAL_OIL_PRICES = [
  { year: 2015, value: 53, label: '2015 (low cycle)' },
  { year: 2016, value: 44, label: '2016 (OPEC turmoil)' },
  { year: 2017, value: 54, label: '2017 (recovery)' },
  { year: 2018, value: 71, label: '2018 (peak)' },
  { year: 2019, value: 64, label: '2019 (trade war)' },
  { year: 2020, value: 41, label: '2020 (COVID crash)' },
  { year: 2021, value: 71, label: '2021 (rebound)' },
  { year: 2022, value: 101, label: '2022 (Ukraine crisis)' },
  { year: 2023, value: 83, label: '2023 (normalization)' },
  { year: 2024, value: 88, label: '2024 (elevated)' },
  { year: 2025, value: 87, label: '2025 (current data)' }
];

// Policy scenarios: predefined combinations for quick exploration
export const POLICY_SCENARIOS = [
  {
    id: 'baseline-2026',
    name: '基准情景 (2026)',
    description: 'Goldman预测 + 现行EU ETS + 隐性补贴',
    crudeUsdPerBarrel: 80,
    carbonPriceUsdPerTonne: 90,
    subsidyUsdPerLiter: 0.50,
    assumptions: 'OPEC稳定、ReFuelEU如期落地'
  },
  {
    id: 'eu-ambition-2030',
    name: '欧盟绿色雄心 (2030)',
    description: '碳价急升 + 直接补贴 + 油价平稳',
    crudeUsdPerBarrel: 80,
    carbonPriceUsdPerTonne: 150,
    subsidyUsdPerLiter: 0.75,
    assumptions: '政策推动SAF成本快速下降；油价保持中位'
  },
  {
    id: 'ira-extended-us',
    name: '美国IRA延续 (2027+)',
    description: '美国补贴提升 + 低油价 + 中等碳价',
    crudeUsdPerBarrel: 70,
    carbonPriceUsdPerTonne: 85,
    subsidyUsdPerLiter: 0.65,
    assumptions: 'IRA税收抵免继续；美国制造成本优势'
  },
  {
    id: 'geopolitical-shock',
    name: '地缘政治冲击 (2027)',
    description: '油价飙升 + 碳价缓升 + 补贴被迫减少',
    crudeUsdPerBarrel: 120,
    carbonPriceUsdPerTonne: 105,
    subsidyUsdPerLiter: 0.35,
    assumptions: '中东冲突；SAF成为战略燃料'
  },
  {
    id: 'lufthansa_shock_2026Q2',
    name: '汉莎燃油冲击 (2026Q2)',
    description: '欧洲航油冲击 + 航班收缩 + 碳价抬升',
    crudeUsdPerBarrel: 115,
    carbonPriceUsdPerTonne: 115,
    subsidyUsdPerLiter: 0.55,
    assumptions: '参考 2026-04-21 Lufthansa 减班公告；航司通过削减短途航班与燃油对冲共同控成本'
  },
  {
    id: 'energy-crisis',
    name: '能源危机加速 (2028)',
    description: '高油价 + 高碳价 + 强制配额驱动',
    crudeUsdPerBarrel: 130,
    carbonPriceUsdPerTonne: 180,
    subsidyUsdPerLiter: 1.00,
    assumptions: '供应侧冲击；碳目标强制SAF转换'
  },
  {
    id: 'demand-collapse',
    name: '需求崩塌 (悲观)',
    description: '油价暴跌 + 碳价停滞 + 补贴取消',
    crudeUsdPerBarrel: 50,
    carbonPriceUsdPerTonne: 60,
    subsidyUsdPerLiter: 0.10,
    assumptions: '全球衰退；航空业需求大幅下滑'
  }
];

// Sensitivity parameters: define the range for 3D exploration
export const SENSITIVITY_RANGES = {
  crude: {
    min: 40,
    max: 150,
    step: 5,
    label: 'Oil Price ($/bbl)',
    unit: '$/bbl'
  },
  carbon: {
    min: 30,
    max: 250,
    step: 10,
    label: 'Carbon Price ($/tCO₂)',
    unit: '$/tCO₂'
  },
  subsidy: {
    min: 0,
    max: 1.5,
    step: 0.05,
    label: 'SAF Subsidy ($/L)',
    unit: '$/L'
  }
};

// Sensitivity calculation: compute competitiveness heatmap for all combinations
export function computeSensitivityMatrix(routeId) {
  const SAF_ROUTES_MAP = {
    'sugar-atj': { baseCost: 1.6, co2Savings: 1.5 },
    'reed-hefa': { baseCost: 1.85, co2Savings: 1.8 },
    'cellulose-ft': { baseCost: 2.3, co2Savings: 2.0 }
  };
  
  const route = SAF_ROUTES_MAP[routeId];
  if (!route) return null;

  const { crude, carbon, subsidy } = SENSITIVITY_RANGES;
  const matrix = [];

  for (let c = crude.min; c <= crude.max; c += crude.step) {
    const row = [];
    for (let cb = carbon.min; cb <= carbon.max; cb += carbon.step) {
      const jetProxy = 0.0082 * c + 0.12;
      const carbonCredit = (cb / 1000) * route.co2Savings;
      const effectiveCost = route.baseCost - carbonCredit - 0.5; // assume subsidy = 0.5 for heatmap
      const competitive = effectiveCost <= jetProxy ? 1 : effectiveCost / jetProxy;
      
      row.push({
        oil: c,
        carbon: cb,
        effectiveCost,
        jetProxy,
        competitive,
        atParity: competitive <= 1
      });
    }
    matrix.push(row);
  }

  return matrix;
}

export const REFUEL_EU_TARGETS = [
  { year: 2025, safSharePct: 2, syntheticSharePct: 0, label: 'Entry into force' },
  { year: 2030, safSharePct: 6, syntheticSharePct: 1.2, label: 'Early scale-up' },
  { year: 2035, safSharePct: 20, syntheticSharePct: 5, label: 'Commercial lift-off' },
  { year: 2040, safSharePct: 34, syntheticSharePct: 10, label: 'Mass adoption' },
  { year: 2045, safSharePct: 42, syntheticSharePct: 15, label: 'Deep transition' },
  { year: 2050, safSharePct: 70, syntheticSharePct: 35, label: 'Long-run target' }
];

export const DATA_SOURCES = {
  brentFred: {
    id: 'brentFred',
    label: 'FRED / EIA Brent spot',
    url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU',
    cadence: 'daily'
  },
  brentEia: {
    id: 'brentEia',
    label: 'EIA Daily Prices (Brent)',
    url: 'https://www.eia.gov/todayinenergy/prices.php',
    cadence: 'weekday'
  },
  jetFred: {
    id: 'jetFred',
    label: 'FRED / EIA Gulf Coast jet fuel spot',
    url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DJFUELUSGULF',
    cadence: 'daily'
  },
  cbamPriceOfficial: {
    id: 'cbamPriceOfficial',
    label: 'European Commission CBAM certificate price',
    url: 'https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/price-cbam-certificates_en',
    cadence: 'quarterly in 2026, weekly from 2027'
  },
  ecbEurUsd: {
    id: 'ecbEurUsd',
    label: 'ECB EUR/USD reference rate',
    url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
    cadence: 'daily'
  },
  euEtsOfficial: {
    id: 'euEtsOfficial',
    label: 'European Commission EU ETS overview',
    url: 'https://climate.ec.europa.eu/eu-action/carbon-markets/about-eu-ets_en',
    cadence: 'reference'
  },
  refuelEuOfficial: {
    id: 'refuelEuOfficial',
    label: 'European Commission ReFuelEU aviation',
    url: 'https://transport.ec.europa.eu/transport-modes/air/environment/refueleu-aviation_en',
    cadence: 'policy'
  }
};
