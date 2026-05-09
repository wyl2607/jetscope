// Pure data + long-text constants extracted from page.tsx so the page file
// only needs to render JSX. Behavior must be identical to the previous inline
// definitions; renaming or restructuring these breaks the page.

export const FACTS = [
  '2026-04-21：Lufthansa Group 公告，至 2026 年 10 月将削减约 20,000 班短途航班。',
  '公告披露该动作预计可节省约 40,000 吨航油。',
  '公告同时指出：伊朗冲突以来，航油价格已显著上行（文中表述为翻倍）。'
] as const;

export const BASELINE = {
  crudeUsdPerBarrel: 80,
  carbonPriceUsdPerTonne: 90,
  subsidyUsdPerLiter: 0.5
} as const;

export const LUFTHANSA_SHOCK_2026Q2 = {
  crudeUsdPerBarrel: 115,
  carbonPriceUsdPerTonne: 115,
  subsidyUsdPerLiter: 0.55
} as const;

export const NAV_ITEMS = [
  { href: '#event-overview', label: '事件概述与数据' },
  { href: '#fuel-cost-breakdown', label: '航油成本分解' },
  { href: '#saf-inflection', label: 'SAF成本转折点' },
  { href: '#market-drivers', label: '市场驱动因素' },
  { href: '#germany-advantage', label: '德国制造优势' },
  { href: '#outlook', label: '未来情景展望' }
] as const;

export const JET_A1_COSTS = [
  { label: '原油成本（Brent $115/桶）', value: '$0.88/升' },
  { label: '精炼、流通利润', value: '$0.12/升' },
  { label: 'EU ETS碳成本', value: '$0.20/升' }
] as const;

// Bullet rows where part of the line is bold-emphasized via <strong>.
type BoldBullet = { bold: string; text: string };

export const GERMAN_PRESSURES: readonly BoldBullet[] = [
  {
    bold: '地理位置劣势：',
    text: '法兰克福、慕尼黑等主要枢纽离海港远，运输成本高。相比荷兰鹿特丹港或比利时安特卫普港，德国机场的航油成本溢价5-10%'
  },
  { bold: '高税环境：', text: '德国能源税率欧洲最高之一，这直接增加了航油终端价格' },
  {
    bold: '短途运力占比高：',
    text: '汉莎集团的运力结构中，欧洲短途航线贡献了大部分航班数但利润率最低。短途飞行中，燃油成本占比30%左右（长途为20-25%）'
  },
  { bold: '竞争激烈：', text: '欧洲短途市场被廉价航空公司（瑞安、易捷等）垄断，价格战已经压低了票价，汉莎难以快速调整' }
] as const;

export const ATJ_COSTS = [
  { label: '原料（甘蔗/甜菜）', value: '$0.35-0.50/升' },
  { label: '能源（发酵、蒸馏）', value: '$0.40-0.70/升' },
  { label: '精炼与处理', value: '$0.20-0.30/升' },
  { label: '物流与利润', value: '$0.15-0.25/升' }
] as const;

export const GREEN_ELECTRICITY_BENEFITS = [
  '使用绿电的SAF生产成本可降至 $1.25-1.50/升',
  '相比其他欧洲进口SAF便宜10-20%',
  '这给汉莎等德国航司采购本土SAF的经济理由'
] as const;

export const REFUEL_EU_ROADMAP = [
  { year: '2025年1月1日', detail: 'SAF掺混比例0.7% → 年需求约4.9万吨（欧洲）' },
  { year: '2027年', detail: 'SAF掺混比例1.0% → 年需求约7万吨' },
  { year: '2030年', detail: 'SAF掺混比例6.0% → 年需求约42万吨 (产业转折点)' },
  { year: '2035年', detail: 'SAF掺混比例10%+ → 年需求70万吨以上' }
] as const;

export const ETS_DRIVERS: readonly BoldBullet[] = [
  { bold: '当前碳价：', text: '€80/吨CO2 ≈ $0.20/升航油成本' },
  { bold: '2030年目标：', text: '€150+/吨CO2 ≈ $0.40-0.50/升航油成本' },
  {
    bold: '含义：',
    text: '传统Jet-A的隐含成本逐年上升，而SAF（特别是用可再生电力生产的）的碳成本接近零，相对竞争力快速改善'
  },
  { bold: '航司响应：', text: '2028-2030年间，经济学将从"强制采购SAF以合规"转向"主动采购SAF以节成本"' }
] as const;

export const GERMANY_ADVANTAGES: readonly BoldBullet[] = [
  {
    bold: '完整的产业链：',
    text: '德国化工巨头（巴斯夫、科万塔）拥有生物精炼与精细化工能力，可快速转向SAF生产。莱茵河流域的石油化工集群天然适合SAF生产。'
  },
  {
    bold: '绿电成本优势：',
    text: '德国陆上风电成本€50-80/MWh（全球最低）。这直接降低SAF生产的能源成本15-20%。'
  },
  { bold: '人才与技术：', text: '德国在生物技术、催化、碳捕获等核心技术上全球领先，这些都是SAF生产的关键。' },
  { bold: '航空运输枢纽：', text: '法兰克福是欧洲第二大航空枢纽，便利的场景测试与市场对接。' },
  { bold: '政府支持：', text: '德国与欧盟都通过贷款、补贴、税收优惠支持本土SAF。2024-2030年投入预期超100亿欧元。' }
] as const;

export const LUFTHANSA_STRATEGIC: readonly BoldBullet[] = [
  {
    bold: '本土供应链：',
    text: '可率先与德国SAF生产商建立长期合作协议，锁定成本优势与供应稳定性。'
  },
  {
    bold: '成本竞争力：',
    text: '使用德国本土生产的绿电SAF，汉莎可在2028-2030年实现比其他欧洲航司更低的燃油成本，形成新的竞争优势。'
  },
  { bold: '品牌与ESG：', text: '削减运力同时加快SAF采购，展现汉莎的可持续承诺，改善企业形象与投资者评分。' }
] as const;

export const OUTLOOK_SCENARIOS = [
  {
    title: '基础情景：油价$110-130/桶，SAF逐步主流化',
    body:
      '地缘冲突持续，OPEC+维持减产。SAF与传统油的成本差异缩小至20-30%。ReFuelEU强制要求驱动SAF需求。到2030年，欧洲SAF年产能达40-50万吨。汉莎与其他大型航司加快采购。德国SAF生产商获得市场领导地位。预期投资回报率15-20%/年。'
  },
  {
    title: '风险情景：油价下跌至$85/桶',
    body:
      '地缘冲突缓解或全球经济衰退。SAF相对传统油贵40-60%，经济学驱动减弱。但ReFuelEU的强制性约束依然存在——航司被迫采购。这实际上加强了SAF的需求确定性。规模经济快速推动成本下降10-15%。产业成熟加快。'
  },
  {
    title: '机遇情景：油价$140+/桶，能源转型加速',
    body:
      '气候政策升级、碳定价加速、可再生能源投资倍增。油价高企推动SAF经济学逆转——SAF成本$1.20/升 vs 传统油$1.60+/升。航司主动采购SAF。产业规模快速扩张。德国制造业与绿色技术出口成为新增长极。这也是最有利于SAF产业的长期趋势。'
  }
] as const;

export const ACTION_ITEMS = [
  '把该场景作为默认“事件冲击”模板放入 scenario registry。',
  '在 sources 页面持续显示来源置信度、滞后与 fallback 说明。',
  '每次重大航司事件后，复用同一页面模板发布可索引分析。'
] as const;

export const DE_LH_ANNOUNCEMENT = [
  '20.000 Kurzstreckenflüge',
  '40.000 Tonnen Treibstoff/Jahr',
  'Grund: Kerosin $115/Fass'
] as const;

export const DE_KEROSENE_BREAKDOWN = [
  { label: 'Rohöl (Brent $115/Fass)', value: '$0,88/L' },
  { label: 'Raffination & Transport', value: '$0,12/L' },
  { label: 'EU-ETS Kohlenstoff', value: '$0,15/L' }
] as const;

export const DE_ADVANTAGES = [
  '✓ Chemie-Cluster: BASF, Covestro',
  '✓ Grünstrom: €50-80/MWh',
  '✓ Biotechnologie & Katalytik'
] as const;

// Paragraphs with optional <strong> spans. Each paragraph is an array of segments;
// segments with `b: true` render inside <strong>, otherwise as plain text.
export type RichSegment = { t: string; b?: true };
export type RichParagraph = readonly RichSegment[];

export const EVENT_OVERVIEW: readonly RichParagraph[] = [
  [
    { t: '2026年4月21日，汉莎集团的削减2万航班公告，从表面上看是一项成本控制措施。但这背后隐藏着一个更深的经济学信号：' },
    { t: '短途航线的低利润率已无法在高油价环境中维持', b: true },
    { t: '。' }
  ],
  [
    { t: '对于汉莎而言，燃油成本占总运营成本的20-30%。当油价从$80/桶跳升至$115/桶（上升43%）时，短途航线的单位成本陡然上升30-35%。在竞争激烈的欧洲短途市场，廉价航空公司（如瑞安航空）已经通过规模与效率压低票价，汉莎难以快速提价来抵消成本上升。因此，削减低利润运力成为一个理性但痛苦的选择。' }
  ],
  [
    { t: '然而，这个事件的真正意义在于：它标志着传统航空业运营模式的一个转折点。削减航班虽然是短期应对，但从长期看，汉莎等欧洲航司的未来竞争力取决于能否快速转向可持续航油（SAF）。因为当油价维持在110-130美元/桶时，' },
    { t: 'SAF成本与传统喷气燃料的差异会快速收窄', b: true },
    { t: '，这将打开一扇新的成本优化之门。' }
  ],
  [
    { t: '同时，欧盟ReFuelEU指令即将在2025年生效，要求航空燃油中SAF掺混比例从2025年的0.7%逐步升至2030年的6%。这意味着SAF从一个可选项变成了强制性合规要求。在这个背景下，汉莎的减班决定可以被重新解读为：航司正在为能源结构的转变而调整战术。' }
  ]
] as const;

export const KEY_INSIGHTS = [
  '汉莎2026年4月的削减航班决定，不是航空业衰退的信号，而是产业升级的开始。过去的航空竞争是"规模与成本优化"，未来的竞争将是"燃料转型与供应链"。那些能够快速采购SAF、建立本土产业链、掌握绿电技术的航空企业和国家，将在2030年后获得显著的成本与竞争优势。',
  '对德国而言，这是一个黄金机遇窗口。现在投资SAF产业、绿电基础设施与相关技术，到2030年可实现全球领导地位。这也解释了为什么汉莎选择削减短途（利润微薄）而投资SAF——这是对未来能源结构的战略赌注。'
] as const;

export const DISCLAIMER_PARAGRAPHS = [
  '本页用于“准实时研究支持”，不是交易系统或投资建议。当前航油数据仍包含代理源（例如 US Gulf / proxy feed），不等同于德国本地机场现货成交价。',
  '当欧洲本土航油与 EU ETS 实时通道接入后，本页将更新为区域优先报价并保留代理源作为回退链路。',
  '结论应结合航司实际对冲策略、税费结构和运力调整计划共同解读。'
] as const;

export const SAF_INFLECTION_MATH = [
  '油价$80/桶 → Jet-A $0.95/升 → SAF贵70% (不经济)',
  '油价$115/桶 → Jet-A $1.20/升 → SAF贵25-40% (可接受边界)',
  '油价$150/桶 → Jet-A $1.50/升 → SAF成本接近或相等 (无差异)'
] as const;
