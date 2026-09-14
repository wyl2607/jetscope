import type { GermanyDecisionKind } from '@/lib/germany-jet-fuel-read-model';
import type { DisplayLocale } from '@/lib/product-read-model';

export type GermanyJetFuelCopy = {
  signalLabel: string;
  decisionLabel: string;
  decisions: Record<GermanyDecisionKind, string>;
  historyMissing: string;
  quoteDate: string;
  lastCheck: string;
  staleKeep: string;
  costTitle: string;
  costWhy: string;
  estimateBanner: string;
  airportLabel: string;
  fuelKgLabel: string;
  paxLabel: string;
  blendLabel: string;
  safPriceLabel: string;
  airportDiffLabel: string;
  taxUseLabel: string;
  taxCommercial: string;
  taxPrivate: string;
  taxAssumption: string;
  perFlight: string;
  perPax: string;
  delivered: string;
  fuelOnly: string;
  carbonOnly: string;
  noAirportQuote: string;
  missingSaf: string;
  missingCarbon: string;
  invalidInput: string;
  costChangeTitle: string;
  deltaFlight: string;
  deltaPax: string;
  methodLabel: string;
  limitations: string[];
  sourceLinks: ReadonlyArray<{ href: string; label: string; key: string }>;
};

export const germanyJetFuelCopy: Record<DisplayLocale, GermanyJetFuelCopy> = {
  zh: {
    signalLabel: '德国航油决策信号',
    decisionLabel: '德国航油决策压力',
    decisions: {
      insufficient: '历史不足',
      revisit: '重看合同/套保',
      review: '需要复核',
      stable: '暂不需要重看'
    },
    historyMissing: '历史不足',
    quoteDate: '行情日期',
    lastCheck: '上次检查',
    staleKeep: '刷新失败，保留上次有效行情',
    costTitle: '市场联动成本估算',
    costWhy: '在没有机场到机价和航班账单时，只估算燃油及合规成本如何随公开行情变动。',
    estimateBanner: '这是市场联动成本估算，不是航空公司真实账单，也不是航班总运营成本。',
    airportLabel: '航线预设',
    fuelKgLabel: '耗油 kg',
    paxLabel: '旅客数',
    blendLabel: 'SAF 掺混 %',
    safPriceLabel: 'SAF 价格 USD/L（用户假设）',
    airportDiffLabel: '机场差额 EUR/t（待提供）',
    taxUseLabel: '税务用途',
    taxCommercial: '商业航空（默认免税）',
    taxPrivate: '私人用途（能源税情景假设）',
    taxAssumption: '私人用途按 0.6545 EUR/L 能源税假设换算，不是已核实的适用税额。',
    perFlight: '每班燃油及合规',
    perPax: '每旅客',
    delivered: '到机估算',
    fuelOnly: '燃油小计',
    carbonOnly: '碳成本',
    noAirportQuote: '德国机场价差待提供，当前未输出机场实测价。',
    missingSaf: 'SAF 比例大于 0 时需要可靠 SAF 报价或明确的价格假设。',
    missingCarbon: '存在碳履约义务但缺少 EUA 报价，合规总额保持未知。',
    invalidInput: '输入无效，未输出看似正常的数字。',
    costChangeTitle: '相对基准的成本变化',
    deltaFlight: '每班增量',
    deltaPax: '每旅客增量',
    methodLabel: '来源与价格趋势方法',
    limitations: [
      '航油价格是代理指标，可能与德国具体机场的合约结算价存在差异。',
      '区域数据源不可用时，EU 航油代理价可能临时回退到全球航油序列；回退值不能当作实测。',
      '碳价代理跟踪政策成本压力，应结合航线与掺混假设解读。SAF 百分比不会自动视为全部免碳。',
      '本页用于决策支持，不用于交易执行；采购决策仍需与合约供应商报价交叉核验。',
      '未覆盖机组、维修、起降费等非燃油成本，故不显示航班总运营成本。'
    ],
    sourceLinks: [
      { href: '/sources?focus=brent_usd_per_bbl', label: 'Brent 来源状态', key: 'brent_usd_per_bbl' },
      { href: '/sources?focus=jet_usd_per_l', label: '全球航油来源状态', key: 'jet_usd_per_l' },
      { href: '/sources?focus=rotterdam_jet_fuel_usd_per_l', label: '鹿特丹航煤来源状态', key: 'rotterdam_jet_fuel_usd_per_l' },
      { href: '/sources?focus=jet_eu_proxy_usd_per_l', label: 'EU 航油代理来源状态', key: 'jet_eu_proxy_usd_per_l' },
      { href: '/sources?focus=carbon_proxy_usd_per_t', label: '碳价代理来源状态', key: 'carbon_proxy_usd_per_t' }
    ]
  },
  de: {
    signalLabel: 'Deutschland Jet-Fuel Entscheidungssignale',
    decisionLabel: 'Entscheidungsdruck',
    decisions: {
      insufficient: 'Historie unzureichend',
      revisit: 'Vertrag/Hedge prüfen',
      review: 'Prüfung nötig',
      stable: 'Noch kein Anlass'
    },
    historyMissing: 'Historie unzureichend',
    quoteDate: 'Notierungsdatum',
    lastCheck: 'Letzte Prüfung',
    staleKeep: 'Aktualisierung fehlgeschlagen, letzte gültige Notierung bleibt stehen',
    costTitle: 'Marktgekoppelte Kostenschätzung',
    costWhy: 'Ohne Flughafen-Into-plane-Preis und Airline-Rechnung schätzen wir nur Kraftstoff- und Compliance-Kosten.',
    estimateBanner: 'Das ist eine marktgekoppelte Kostenschätzung, keine Airline-Rechnung und keine gesamten Flugbetriebskosten.',
    airportLabel: 'Streckenvorlage',
    fuelKgLabel: 'Verbrauch kg',
    paxLabel: 'Passagiere',
    blendLabel: 'SAF-Beimischung %',
    safPriceLabel: 'SAF-Preis USD/L (Nutzerannahme)',
    airportDiffLabel: 'Flughafen-Differenz EUR/t (offen)',
    taxUseLabel: 'Steuerliche Nutzung',
    taxCommercial: 'Kommerziell (in der Regel steuerfrei)',
    taxPrivate: 'Privat (Energiesteuer-Szenarioannahme)',
    taxAssumption: 'Privatnutzung verwendet 0,6545 EUR/L als Energiesteuer-Annahme, nicht als geprüfte Steuerfestsetzung.',
    perFlight: 'Je Flug Kraftstoff+Compliance',
    perPax: 'Je Passagier',
    delivered: 'Delivered-Schätzung',
    fuelOnly: 'Kraftstoff-Teilsumme',
    carbonOnly: 'Kohlenstoffkosten',
    noAirportQuote: 'Deutsche Flughafen-Differenz fehlt; kein gemessener Into-plane-Preis.',
    missingSaf: 'Bei SAF-Anteil > 0 ist ein belastbarer SAF-Preis oder eine explizite Annahme nötig.',
    missingCarbon: 'ETS greift, aber der EUA-Preis fehlt; die Compliance-Summe bleibt unbekannt.',
    invalidInput: 'Ungültige Eingabe; es wird keine scheinbar normale Zahl ausgegeben.',
    costChangeTitle: 'Kostenänderung gegenüber Basis',
    deltaFlight: 'Delta je Flug',
    deltaPax: 'Delta je Passagier',
    methodLabel: 'Methode für Quellen und Preisbewegungen',
    limitations: [
      'Jet-Fuel-Preise sind Proxies und können von standortspezifischen Vertragswerten in Deutschland abweichen.',
      'Der EU-Jet-Proxy kann bei Datenfeed-Ausfall vorübergehend auf die globale Jet-Serie zurückfallen; ein Fallback ist keine Messung.',
      'Der Carbon-Proxy zeigt Richtlinien-Kostendruck. Ein SAF-Prozentsatz gilt nicht automatisch als vollständige ETS-Befreiung.',
      'Diese Seite unterstützt Entscheidungen, ist aber kein Ausführungsfeed; Beschaffungsentscheidungen müssen gegen Lieferantenangebote geprüft werden.',
      'Ohne Nicht-Kraftstoffkosten gibt es keine Darstellung der gesamten Flugbetriebskosten.'
    ],
    sourceLinks: [
      { href: '/de/sources?focus=brent_usd_per_bbl', label: 'Brent-Quellenstatus', key: 'brent_usd_per_bbl' },
      { href: '/de/sources?focus=jet_usd_per_l', label: 'Globaler Jet-Quellenstatus', key: 'jet_usd_per_l' },
      { href: '/de/sources?focus=rotterdam_jet_fuel_usd_per_l', label: 'Rotterdam-Jet-Quellenstatus', key: 'rotterdam_jet_fuel_usd_per_l' },
      { href: '/de/sources?focus=jet_eu_proxy_usd_per_l', label: 'EU-Jet-Proxy-Quellenstatus', key: 'jet_eu_proxy_usd_per_l' },
      { href: '/de/sources?focus=carbon_proxy_usd_per_t', label: 'Carbon-Proxy-Quellenstatus', key: 'carbon_proxy_usd_per_t' }
    ]
  },
  en: {
    signalLabel: 'Germany jet-fuel decision signals',
    decisionLabel: 'Decision pressure',
    decisions: {
      insufficient: 'Insufficient history',
      revisit: 'Revisit contract/hedge',
      review: 'Review needed',
      stable: 'No trigger yet'
    },
    historyMissing: 'Insufficient history',
    quoteDate: 'Quote date',
    lastCheck: 'Last check',
    staleKeep: 'Refresh failed; keeping the last valid quote',
    costTitle: 'Market-linked cost estimate',
    costWhy: 'Without an airport into-plane quote and airline invoice, this only estimates fuel and compliance cost.',
    estimateBanner: 'This is a market-linked cost estimate, not an airline invoice and not total flight operating cost.',
    airportLabel: 'Route preset',
    fuelKgLabel: 'Fuel burn kg',
    paxLabel: 'Passengers',
    blendLabel: 'SAF blend %',
    safPriceLabel: 'SAF price USD/L (user assumption)',
    airportDiffLabel: 'Airport differential EUR/t (pending)',
    taxUseLabel: 'Tax use',
    taxCommercial: 'Commercial (typically exempt)',
    taxPrivate: 'Private (energy-tax scenario assumption)',
    taxAssumption: 'Private use applies a 0.6545 EUR/L energy-tax assumption, not a verified tax assessment.',
    perFlight: 'Fuel + compliance / flight',
    perPax: 'Per passenger',
    delivered: 'Delivered estimate',
    fuelOnly: 'Fuel subtotal',
    carbonOnly: 'Carbon cost',
    noAirportQuote: 'German airport differential pending; no measured into-plane price.',
    missingSaf: 'A non-zero SAF share needs a reliable SAF quote or an explicit price assumption.',
    missingCarbon: 'ETS applies but the EUA quote is missing, so the compliance total stays unknown.',
    invalidInput: 'Invalid input; no plausible number is shown.',
    costChangeTitle: 'Cost change versus baseline',
    deltaFlight: 'Delta / flight',
    deltaPax: 'Delta / passenger',
    methodLabel: 'Source and price-movement method',
    limitations: [
      'Jet-fuel prices are proxies and may differ from airport-specific or contract-settled prices in Germany.',
      'The EU jet proxy can temporarily fall back to the global jet-fuel series when regional data is unavailable; a fallback is not a measurement.',
      'The carbon proxy reflects policy-cost pressure. A SAF percentage is not an automatic full ETS exemption.',
      'Decision support, not a trading feed. Compare procurement action with supplier quotes and internal contract terms.',
      'Non-fuel operating costs are not covered, so this page does not show total flight operating cost.'
    ],
    sourceLinks: [
      { href: '/en/sources?focus=brent_usd_per_bbl', label: 'Brent source status', key: 'brent_usd_per_bbl' },
      { href: '/en/sources?focus=jet_usd_per_l', label: 'Global jet-fuel source status', key: 'jet_usd_per_l' },
      { href: '/en/sources?focus=rotterdam_jet_fuel_usd_per_l', label: 'Rotterdam jet source status', key: 'rotterdam_jet_fuel_usd_per_l' },
      { href: '/en/sources?focus=jet_eu_proxy_usd_per_l', label: 'EU jet proxy source status', key: 'jet_eu_proxy_usd_per_l' },
      { href: '/en/sources?focus=carbon_proxy_usd_per_t', label: 'Carbon proxy source status', key: 'carbon_proxy_usd_per_t' }
    ]
  }
};
