export type IndustryCountryId = 'eu' | 'de' | 'us' | 'jp' | 'nl' | 'cn' | 'sg' | 'in';

export type IndustryCountryPolicyType = 'mandate' | 'incentive' | 'planning' | 'early';

export type IndustryCountry = {
  id: IndustryCountryId;
  flag: string;
  nameZh: string;
  nameEn: string;
  currentPct: number;
  target2030Pct: number;
  policyType: IndustryCountryPolicyType;
  policyStrength: 1 | 2 | 3 | 4 | 5;
  sourceNote: string;
  verificationStatus: 'verified' | 'estimate';
};

export const INDUSTRY_COUNTRIES: ReadonlyArray<IndustryCountry> = [
  {
    id: 'eu',
    flag: '🇪🇺',
    nameZh: '欧盟 ReFuelEU',
    nameEn: 'EU ReFuelEU',
    currentPct: 0.7,
    target2030Pct: 2,
    policyType: 'mandate',
    policyStrength: 5,
    sourceNote: 'ReFuelEU Aviation Art. 4 and delegated updates, 2024-2025.',
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
    sourceNote: 'Estimate, needs verification: German implementation track aligned with EU ReFuelEU obligations, 2025.',
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
    sourceNote: 'Estimate, needs verification: US SAF support relies on tax-credit and grant incentives, 2024-2026.',
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
    sourceNote: 'Estimate, needs verification: Japan airline SAF adoption roadmap toward 2030 policy target, 2024.',
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
    sourceNote: 'Estimate, needs verification: Dutch airport/fuel-supplier SAF hub planning under EU mandate path, 2025.',
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
    sourceNote: 'Estimate, needs verification: China SAF blend trajectory remains policy-planning led, 2025.',
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
    sourceNote: 'Estimate, needs verification: Singapore SAF deployment combines hub strategy and fiscal incentives, 2024.',
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
    sourceNote: 'Estimate, needs verification: India SAF requirement starts via phased pilot/early mandate steps, 2026.',
    verificationStatus: 'estimate'
  }
];
