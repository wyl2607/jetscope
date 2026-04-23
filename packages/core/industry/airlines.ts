export type IndustryAirlineAlliance = 'Star' | 'SkyTeam' | 'OneWorld' | 'Independent';

export type IndustryAirline = {
  id: string;
  name: string;
  alliance: IndustryAirlineAlliance;
  currentPct: number;
  target2030Pct: number;
  sourceNote: string;
  verificationStatus: 'verified' | 'estimate';
  badge?: string;
};

export const INDUSTRY_AIRLINES: ReadonlyArray<IndustryAirline> = [
  {
    id: 'air-france-klm',
    name: 'Air France-KLM',
    alliance: 'SkyTeam',
    currentPct: 1.1,
    target2030Pct: 10,
    sourceNote: 'Estimate, needs verification: Group sustainability pathway references 10% SAF ambition by 2030.',
    verificationStatus: 'estimate',
    badge: 'est./估算'
  },
  {
    id: 'lufthansa',
    name: 'Lufthansa',
    alliance: 'Star',
    currentPct: 0.8,
    target2030Pct: 10,
    sourceNote: 'Estimate, needs verification: Lufthansa Group SAF uptake track aligned with EU decarbonization milestones.',
    verificationStatus: 'estimate',
    badge: 'est./估算'
  },
  {
    id: 'british-airways',
    name: 'British Airways',
    alliance: 'OneWorld',
    currentPct: 0.7,
    target2030Pct: 10,
    sourceNote: 'Estimate, needs verification: British Airways SAF usage and procurement targets through 2030 reporting.',
    verificationStatus: 'estimate',
    badge: 'est./估算'
  },
  {
    id: 'alaska-airlines',
    name: 'Alaska Airlines',
    alliance: 'OneWorld',
    currentPct: 0.68,
    target2030Pct: 10,
    sourceNote: 'Estimate, needs verification: Alaska Airlines SAF roadmap and public 2030 commitments.',
    verificationStatus: 'estimate'
  },
  {
    id: 'united-airlines',
    name: 'United Airlines',
    alliance: 'Star',
    currentPct: 0.5,
    target2030Pct: 10,
    sourceNote: 'Estimate, needs verification: United SAF deployment strategy with stated 2030 blend-direction target.',
    verificationStatus: 'estimate',
    badge: 'est./估算'
  },
  {
    id: 'singapore-airlines',
    name: 'Singapore Airlines',
    alliance: 'Star',
    currentPct: 0.5,
    target2030Pct: 5,
    sourceNote: 'Estimate, needs verification: Singapore Airlines SAF adoption milestones tied to regional mandates.',
    verificationStatus: 'estimate',
    badge: 'est./估算'
  },
  {
    id: 'delta-air-lines',
    name: 'Delta Air Lines',
    alliance: 'SkyTeam',
    currentPct: 0.3,
    target2030Pct: 10,
    sourceNote: 'Estimate, needs verification: Delta decarbonization disclosures indicate 2030 SAF scale-up objective.',
    verificationStatus: 'estimate',
    badge: 'est./估算'
  },
  {
    id: 'jetblue',
    name: 'JetBlue',
    alliance: 'Independent',
    currentPct: 0.3,
    target2030Pct: 5,
    sourceNote: 'Estimate, needs verification: JetBlue SAF offtake and midpoint adoption target disclosures.',
    verificationStatus: 'estimate',
    badge: 'est./估算'
  }
];
