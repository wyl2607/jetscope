import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { SourceFooter } from '@/components/source-footer';
import { getReserveSeverity } from '@/lib/market-signals';
import { getDashboardReadModel } from '@/lib/product-read-model';
import { getPriceTrendChartReadModel } from '@/lib/price-trend-chart-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'EU 航油储备危机监测',
  description: '实时跟踪欧洲航油储备、价格冲击与 SAF 竞争力拐点的危机看板。',
  path: '/crisis/eu-jet-reserves'
});

function getReserveData(): { weeks: number; updatedAt: string; source: string; nextUpdate: string } {
  const raw = process.env.SAFVSOIL_RESERVE_WEEKS;
  const weeks = Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : 3.0;
  return {
    weeks,
    updatedAt: '2026-04-23T06:00:00Z',
    source: 'IATA / EUROCONTROL estimates (manually curated)',
    nextUpdate: '2026-04-30T06:00:00Z'
  };
}

function formatNumber(value: number, digits = 2) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('zh-CN', { timeZone: 'UTC' });
}

const evidenceLayers = [
  {
    label: '事实层',
    title: '先看可量化输入',
    body: '油价、航油代理价、碳价、储备周数和历史覆盖天数必须先于叙事出现；缺数据时显示 proxy/fallback，而不是把估算包装成实时事实。'
  },
  {
    label: '机制层',
    title: '再解释因果链',
    body: '储备收紧会放大区域航油 basis，航油成本压缩薄利航线，碳价与政策补贴改变 SAF 与 Jet-A 的相对经济性。'
  },
  {
    label: '置信层',
    title: '把不确定性放在台面上',
    body: 'EU 航油和德国溢价仍是代理曲线；储备信号若来自人工估算，就必须低于交易所或官方统计数据的可信等级。'
  },
  {
    label: '行动层',
    title: '只给可复核动作',
    body: '页面不直接给采购结论；它把用户引到来源复核、SAF 工作台、套保/锁价讨论和 offtake 情景测试。'
  }
];

const researchReferences = [
  { title: 'NREL SAF', href: 'https://www.nrel.gov/docs/fy24osti/87802.pdf', note: '约束 SAF 路径的技术经济边界。' },
  { title: 'IATA Fuel', href: 'https://www.iata.org/en/programs/ops-infra/fuel/', note: '支撑航空燃油成本的运营逻辑。' },
  { title: 'EU ETS aviation', href: 'https://climate.ec.europa.eu/eu-action/transport/reducing-emissions-aviation_en', note: '解释碳定价如何进入欧洲航空成本。' },
  { title: 'IEA Aviation', href: 'https://www.iea.org/reports/aviation', note: '校验 SAF 需求与航空脱碳路径。' }
];

function CurrentSafBreakpointRow() {
  const jetA = (115 / 158.987) * 1.2;

  return (
    <tr className="ring-2 ring-warning bg-warning-soft text-ink">
      <td className="py-4 pr-4 font-semibold">$115/bbl（当前拐点）</td>
      <td className="py-4 pr-4 font-semibold">~${formatNumber(jetA, 2)}/L</td>
      <td className="py-4 pr-4">$1.60–1.85/L</td>
      <td className="py-4 pr-4 font-semibold text-warning">拐点距离</td>
      <td className="py-4 font-semibold text-warning">需复核</td>
    </tr>
  );
}

export default async function EuJetReserveCrisisPage() {
  const [readModel, priceChartData] = await Promise.all([
    getDashboardReadModel(),
    getPriceTrendChartReadModel()
  ]);

  const fallbackReserve = getReserveData();
  const reserveIsAssumed = !readModel.reserve;
  const reserve = readModel.reserve
    ? {
        weeks: readModel.reserve.coverage_weeks,
        updatedAt: readModel.reserve.generated_at,
        source: readModel.reserve.source_name,
        nextUpdate: fallbackReserve.nextUpdate
      }
    : fallbackReserve;
  const level = getReserveSeverity(reserve.weeks);
  const market = readModel.market.values;
  const brentIsAssumed = market.brent_usd_per_bbl == null;
  const jetEuIsAssumed = market.jet_eu_proxy_usd_per_l == null && market.jet_usd_per_l == null;
  const carbonIsAssumed = market.carbon_proxy_usd_per_t == null;
  const brent = market.brent_usd_per_bbl ?? 87.01;
  const jetEu = market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l ?? 0.657;
  const carbon = market.carbon_proxy_usd_per_t ?? 91.91;
  const anyInputIsAssumed = readModel.isFallback || reserveIsAssumed || brentIsAssumed || jetEuIsAssumed || carbonIsAssumed;
  const asOf = anyInputIsAssumed ? null : readModel.market.generated_at;
  const safSpreadLow = ((1.6 - jetEu) / jetEu) * 100;
  const safSpreadHigh = ((1.85 - jetEu) / jetEu) * 100;
  const inputAssumptionCopy = [
    reserveIsAssumed ? `储备使用人工维护值 ${formatNumber(reserve.weeks, 1)} 周` : null,
    brentIsAssumed ? 'Brent 使用内置假设 87.01 USD/bbl' : null,
    jetEuIsAssumed ? 'EU 航油使用内置假设 0.657 USD/L' : null,
    carbonIsAssumed ? '碳价使用内置假设 91.91 USD/tCO₂' : null
  ].filter(Boolean).join('；');

  return (
    <PageTemplate
      eyebrow="危机监测"
      title="EU 航油储备危机"
      question="当前储备压力是否已经高到需要提前锁价或启动 SAF 承购谈判？"
      asOf={asOf}
    >
      <SignalRow label="储备危机结论">
        <MetricCard
          label="当前储备压力"
          value={`${formatNumber(reserve.weeks, 1)} 周`}
          valueClassName={level.color}
          hint={`${level.label} · ${reserveIsAssumed ? '人工估算，需复核' : reserve.source}`}
        />
        <MetricCard
          label="SAF 当前溢价"
          value={`${formatNumber(safSpreadLow, 0)}–${formatNumber(safSpreadHigh, 0)}%`}
          valueClassName={jetEuIsAssumed ? 'text-warning' : 'text-ink'}
          hint="由 EU 航油基准与 HEFA 成本区间推导，基准缺失时仅供情景讨论。"
        />
        <MetricCard
          label="输入可信度"
          value={anyInputIsAssumed ? '含内置假设' : '已连接'}
          valueClassName={anyInputIsAssumed ? 'text-warning' : 'text-success'}
          hint={inputAssumptionCopy || '储备与市场输入均来自已连接来源。'}
          cardHref="/sources?filter=review"
        />
      </SignalRow>

      <Panel
        title="储备与市场输入"
        why={inputAssumptionCopy || '把储备、原油、区域航油和碳价放在一起，判断压力来自供给收紧还是成本传导。'}
      >
        <div className="space-y-6">
          <div className="rounded-2xl border border-line bg-warning-soft p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${level.color}`}>{level.label}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-ink">
                  {formatNumber(reserve.weeks, 1)} <span className="text-lg font-medium text-muted">周</span>
                </p>
                <p className="mt-1 text-xs tabular-nums text-muted">
                  更新于 {formatDate(reserve.updatedAt)} · 下次更新 {formatDate(reserve.nextUpdate)} · {reserve.source}
                </p>
              </div>
              <div className="w-full md:w-1/2">
                <div className="h-4 w-full overflow-hidden rounded-xl bg-surface">
                  <div className={`h-full ${level.barColor}`} style={{ width: `${Math.min(100, Math.max(5, (reserve.weeks / 8) * 100))}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs tabular-nums text-muted">
                  <span>0w</span><span className="text-danger">2 周·严重</span><span className="text-warning">4 周·偏高</span><span className="text-success">8 周+·正常</span>
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { label: 'Brent 原油', value: `$${formatNumber(brent)}/bbl`, note: brentIsAssumed ? '内置假设 87.01 USD/bbl' : '全球基准观测' },
              { label: '航油（EU 代理）', value: `$${formatNumber(jetEu, 3)}/L`, note: jetEuIsAssumed ? '内置假设 0.657 USD/L' : 'ARA / Rotterdam basis' },
              { label: '碳价代理', value: `$${formatNumber(carbon)}/tCO₂`, note: carbonIsAssumed ? '内置假设 91.91 USD/tCO₂' : 'CBAM + EU ETS 压力' }
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-line bg-surface-muted p-6">
                <p className="text-sm font-medium text-muted">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{item.value}</p>
                <p className={`mt-2 text-xs ${item.note.includes('假设') ? 'text-warning' : 'text-muted'}`}>{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="危机链条" why="把储备变化连接到价格、航线经济性与 SAF 采购窗口，避免用单个价格信号直接下结论。">
        <div className="grid gap-6 md:grid-cols-4">
          {[
            ['步骤 1', '储备消耗', `EU 航油库存约 ${formatNumber(reserve.weeks, 1)} 周，地缘扰动与炼化瓶颈共同推高压力。`, 'border-danger bg-danger-soft text-danger'],
            ['步骤 2', '价格跳升', `当前 EU 代理价 $${formatNumber(jetEu, 3)}/L，储备稀缺可能放大区域 basis。`, 'border-warning bg-warning-soft text-warning'],
            ['步骤 3', '航线承压', '燃油约占短途运营成本 30%，薄利航线会更早失去缓冲。', 'border-line bg-surface-muted text-muted'],
            ['步骤 4', 'SAF 窗口', `HEFA SAF 当前溢价约 ${formatNumber(safSpreadLow, 0)}–${formatNumber(safSpreadHigh, 0)}%。`, 'border-success bg-success-soft text-success']
          ].map(([step, title, body, tone]) => (
            <div key={step} className={`rounded-2xl border p-6 ${tone}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">{step}</p>
              <p className="mt-2 text-sm font-semibold text-ink">{title}</p>
              <p className="mt-1 text-xs leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="第一性原理证据链" why="将事实、机制、置信和行动分开，确保每一步都能回到数据、假设或机构研究。">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.42fr]">
          <div className="grid gap-6 md:grid-cols-2">
            {evidenceLayers.map((item) => (
              <div key={item.label} className="rounded-2xl border border-line bg-surface-muted p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{item.label}</p>
                <p className="mt-2 text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-2 text-xs leading-6 text-muted">{item.body}</p>
              </div>
            ))}
          </div>
          <aside className="space-y-4">
            {researchReferences.map((item) => (
              <a key={item.title} href={item.href} target="_blank" rel="noreferrer" className="block rounded-xl border border-line bg-surface p-4 text-sm transition hover:border-accent hover:bg-accent-soft">
                <span className="font-semibold text-ink">{item.title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted">{item.note}</span>
              </a>
            ))}
            <div className="rounded-xl border border-warning bg-warning-soft p-4 text-xs leading-6 text-warning">
              <p className="font-semibold">模型边界</p>
              <p className="mt-1">当前比较用于运营复核，不是价格预测；区域代理曲线和人工储备估算仍需官方库存或航司采购数据校准。</p>
            </div>
          </aside>
        </div>
      </Panel>

      <Panel title="当前与压力情景下的 SAF 竞争力" why="比较不同油价情景下 Jet-A 与 HEFA 成本距离，判断采购窗口需要哪些输入先被复核。">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-2 text-sm tabular-nums text-muted">
            <thead><tr className="text-left text-subtle"><th className="py-3 pr-4">油价情景</th><th className="py-3 pr-4">Jet-A 成本</th><th className="py-3 pr-4">HEFA SAF 成本</th><th className="py-3 pr-4">SAF 溢价</th><th className="py-3">信号</th></tr></thead>
            <tbody>
              <tr className="bg-surface-muted"><td className="py-3 pr-4">$80/bbl</td><td className="py-3 pr-4">~$0.95/L</td><td className="py-3 pr-4">$1.60–1.85/L</td><td className="py-3 pr-4 text-danger">+70–95%</td><td className="py-3 text-danger">SAF 经济性不足</td></tr>
              <CurrentSafBreakpointRow />
              <tr className="bg-surface-muted"><td className="py-3 pr-4">$130/bbl</td><td className="py-3 pr-4">~${formatNumber((130 / 158.987) * 1.2, 2)}/L</td><td className="py-3 pr-4">$1.60–1.85/L</td><td className="py-3 pr-4 text-warning">收窄</td><td className="py-3 text-warning">边际切换</td></tr>
              <tr className="bg-surface-muted"><td className="py-3 pr-4">$150/bbl</td><td className="py-3 pr-4">~${formatNumber((150 / 158.987) * 1.2, 2)}/L</td><td className="py-3 pr-4">$1.20–1.40/L</td><td className="py-3 pr-4 text-success">−10 至 +15%</td><td className="py-3 text-success">SAF 占优</td></tr>
            </tbody>
          </table>
          <aside className="mt-6 rounded-xl border border-warning bg-warning-soft p-4 text-sm text-warning">
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">阅读方式</p>
            <p className="mt-2 leading-6">
              拐点行不是预测结论；先复核碳价、EU 航油代理价和储备周数，再进入模拟器测试切换条件。
            </p>
          </aside>
        </div>
      </Panel>

      <Panel
        title="航线经济性领先指标"
        why="航班削减能验证燃油压力是否已经穿透到运营动作，但单一航司事件不能代表整个市场。"
        action={<Link href="/analysis/lufthansa-flight-cuts-2026-04" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:bg-accent-soft">中文完整分析 →</Link>}
      >
        <div className="space-y-4 text-sm leading-7 text-muted">
          <p>2026 年 4 月，Lufthansa 宣布取消 <strong className="tabular-nums text-ink">20,000 个短途航班</strong>。燃油约占短途运营成本的 <strong className="tabular-nums text-ink">30%</strong>，利润率仅 <strong className="tabular-nums text-ink">2–3%</strong> 的航线会更早转为亏损。</p>
          <Link href={'/de/lufthansa-saf-2026' as Route} className="inline-block rounded-xl bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-ink">德语分析 →</Link>
        </div>
      </Panel>

      <Panel title="历史价格趋势" why="用同一份本地 market_snapshots 历史库核对储备判断与 1 日、7 日和 30 日价格走势是否一致。">
        <PriceTrendsChart metrics={priceChartData.metrics} isLoading={false} error={priceChartData.error} />
      </Panel>

      <Panel title="运营方决策清单" why="把危机信号转为可复核动作顺序，避免把本页误读成自动采购建议。">
        <ul className="space-y-4 text-sm leading-7 text-muted">
          <li><span className="mr-2 text-danger">✗</span><strong>观望：</strong>低储备通常先于配给或价格跳升出现。</li>
          <li><span className="mr-2 text-warning">△</span><strong>远期套保：</strong>先确认交易对手与固定价格窗口。</li>
          <li><span className="mr-2 text-success">✓</span><strong>锁定 SAF offtake：</strong>复核输入后再谈判长期协议。</li>
          <li><span className="mr-2 text-success">✓</span><strong>持续监测：</strong>储备估算按周更新，市场数据按其来源节奏更新。</li>
        </ul>
      </Panel>

      <SourceFooter
        sources={[
          { id: 'eu-reserve-estimate', label: `EU 航油储备覆盖（${reserve.source}）`, asOf: reserveIsAssumed ? null : reserve.updatedAt, basis: reserveIsAssumed ? 'assumption' : readModel.reserve?.source_type === 'official' ? 'observed' : readModel.reserve?.source_type === 'derived' ? 'derived' : 'assumption' },
          { id: 'eu-crisis-brent', label: brentIsAssumed ? 'Brent 内置假设 87.01 USD/bbl' : 'Brent 市场快照', asOf: brentIsAssumed ? null : asOf, basis: readModel.isFallback || brentIsAssumed ? 'assumption' : 'observed' },
          { id: 'eu-crisis-jet', label: jetEuIsAssumed ? 'EU 航油内置假设 0.657 USD/L' : market.jet_eu_proxy_usd_per_l != null ? 'EU 航油代理曲线' : '全球航油市场快照', asOf: jetEuIsAssumed ? null : asOf, basis: readModel.isFallback || jetEuIsAssumed ? 'assumption' : market.jet_eu_proxy_usd_per_l != null ? 'derived' : 'observed' },
          { id: 'eu-crisis-carbon', label: carbonIsAssumed ? '碳价内置假设 91.91 USD/tCO₂' : 'EU 碳价代理', asOf: carbonIsAssumed ? null : asOf, basis: readModel.isFallback || carbonIsAssumed ? 'assumption' : 'derived' },
          { id: 'market-price-history', label: 'market_snapshots 历史价格序列（上游未暴露 source_type）', basis: 'assumption' }
        ]}
        methodHref="/sources"
        methodLabel="口径与来源清单"
        limitations={[
          '本页描述区域层面的储备与价格压力，不代表单一航司的合同、库存或采购审批。',
          '任一市场输入或储备覆盖落到内置值时，页面不显示 as-of 戳，相关结论只能用于情景讨论。',
          'EU 航油与碳价可能来自代理曲线；代理值是推导依据，不是直接市场观测。',
          '历史价格接口未暴露逐点 source_type，因此来源脚注保守标为情景假设。',
          'SAF 成本比较是敏感性分析，不是价格预测或采购建议。'
        ]}
      />
    </PageTemplate>
  );
}
