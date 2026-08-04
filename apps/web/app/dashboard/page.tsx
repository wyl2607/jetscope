import { InfoCard, MetricCard } from '@/components/cards';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { Shell } from '@/components/shell';
import { PolicyTimelineWithMarketTime } from '@/components/policy-timeline-with-market-time';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { computeDashboardAlertBanners } from '@/lib/market-signals';
import { getDashboardReadModel, type DashboardReadModel } from '@/lib/dashboard-read-model';
import { getPriceTrendChartReadModel } from '@/lib/product-read-model';
import { getSourcesReadModel } from '@/lib/sources-read-model';
import { SafPathwayComparisonTable } from '@/components/saf-pathway-comparison-table';
import { loadPathwayComparison } from '@/lib/pathways-read-model';
import { EuEtsPressurePanel } from '@/components/eu-ets-pressure-panel';
import { loadEuEtsPressure } from '@/lib/eu-ets-pressure-read-model';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

const priorities = [
  '实时市场数据：Brent 原油、航油代理价、EU ETS 碳价',
  '统一情景引擎：价格、补贴、碳成本与盈亏平衡分析',
  '管理控制：航线假设、政策参数与数据来源',
  '导出与报告：图表、快照与情景对比'
];


export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '决策驾驶舱',
  description:
    '可持续航空燃料与传统航油的实时决策看板，覆盖市场快照、情景库状态与转型交付信号。',
  path: '/dashboard'
});

function formatNumber(value: number, digits = 2) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatAsOf(value: string | null) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString();
}

function sourceStatusLabel(status: string) {
  if (status === 'ok') return '正常';
  if (status === 'degraded') return '降级';
  if (status === 'offline') return '离线';
  if (status === 'unknown') return '未知';
  return status;
}

function freshnessLabel(level: string) {
  if (level === 'fresh') return '新鲜';
  if (level === 'stale') return '偏旧';
  if (level === 'critical') return '严重过期';
  return level;
}

function riskLevelLabel(level: string) {
  if (level === 'normal') return '正常';
  if (level === 'watch') return '观察';
  if (level === 'alert') return '警报';
  return level;
}

function dashboardFallbackHint(readModel: DashboardReadModel) {
  if (!readModel.isFallback) {
    return `来源状态：${sourceStatusLabel(readModel.market.source_status.overall)} · 数据新鲜度：${freshnessLabel(readModel.freshnessSignal.level)}（${readModel.freshnessSignal.minutes} 分钟）`;
  }

  return '本地 API 暂不可用，正在使用内置决策模型，确保驾驶舱仍可审阅。';
}

export default async function DashboardPage() {
  const [readModel, priceChartData, sourcesReadModel] = await Promise.all([
    getDashboardReadModel(),
    getPriceTrendChartReadModel(),
    getSourcesReadModel()
  ]);
  const market = readModel.market.values;
  const risk = readModel.topRiskSignal;
  const freshness = readModel.freshnessSignal;

  const riskColor =
    risk?.level === 'alert' ? 'text-rose-300' : risk?.level === 'watch' ? 'text-amber-300' : 'text-emerald-300';
  const riskValue =
    risk == null
      ? 'n/a'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHref = risk == null ? undefined : `/sources?focus=${encodeURIComponent(risk.metricKey)}`;
  const riskHint =
    risk == null
      ? '暂无历史风险信号'
      : `级别：${riskLevelLabel(risk.level)} · 截至：${formatAsOf(risk.latestAsOf)} · 样本：${risk.sampleCount}`;

  const alertBanners = computeDashboardAlertBanners(readModel.market, risk);
  const derived = readModel.market.derived ?? {};
  const health = readModel.marketHealth;
  const event = readModel.aviationEvent;
  const analysis = readModel.analysisInputs;
  const decision = readModel.airlineDecision;
  const spread =
    typeof derived.jet_vs_brent_spread_usd_per_l === 'number' ? derived.jet_vs_brent_spread_usd_per_l : null;
  const multiplier =
    typeof derived.jet_vs_brent_multiplier === 'number' ? derived.jet_vs_brent_multiplier : null;
  const facts = (event?.verified_facts ?? {}) as Record<string, unknown>;
  const formatEta = (seconds: number | null | undefined) => {
    if (seconds == null || !Number.isFinite(seconds)) return 'n/a';
    if (seconds < 60) return `${seconds}s`;
    return `${Math.round(seconds / 60)}m`;
  };

  let pathwayComparison: Awaited<ReturnType<typeof loadPathwayComparison>> | null = null;
  try {
    pathwayComparison = await loadPathwayComparison({
      fossilJetUsdPerL: analysis?.fossilJetUsdPerL ?? market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l ?? 0.9,
      carbonPriceEurPerT: Number(((market.carbon_proxy_usd_per_t ?? 0) / 1.08).toFixed(2)),
      subsidyUsdPerL: 0,
      blendRatePct: 6
    });
  } catch {
    pathwayComparison = null;
  }

  let euEtsPressure: Awaited<ReturnType<typeof loadEuEtsPressure>> | null = null;
  try {
    euEtsPressure = await loadEuEtsPressure({
      fossilJetUsdPerL: market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l ?? 0.9,
      exemptBlendPct: 6,
      euEtsMin: 0,
      euEtsMax: 200,
      euEtsStep: 50
    });
  } catch {
    euEtsPressure = null;
  }

  return (
    <Shell
      eyebrow="市场情报"
      title="JetScope 决策驾驶舱"
      description="面向 SAF 决策的实时市场快照、情景建模与转型风险信号。"
    >
      <section
        className={`mb-6 rounded-xl border p-4 ${
          health?.healthy === false
            ? 'border-rose-800/60 bg-rose-950/20'
            : 'border-emerald-800/50 bg-emerald-950/20'
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Live market strip</p>
        <p className="mt-1 text-sm text-slate-200">
          Snapshot as_of <strong className="text-white">{formatAsOf(readModel.market.generated_at)}</strong>
          {' · '}
          freshness <strong className="text-white">{freshnessLabel(freshness.level)}</strong> ({freshness.minutes}m)
          {' · '}
          overall <code className="text-sky-300">{sourceStatusLabel(readModel.market.source_status.overall)}</code>
          {spread != null && (
            <>
              {' · '}
              Jet–Brent spread <strong className="text-white">${formatNumber(spread, 3)}/L</strong>
              {multiplier != null ? ` (×${formatNumber(multiplier, 3)})` : ''}
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Analysis jet: {analysis?.jetSourceKey ?? 'n/a'}=$
          {formatNumber(analysis?.fossilJetUsdPerL ?? market.jet_eu_proxy_usd_per_l ?? 0, 3)}/L · ETS €
          {formatNumber(analysis?.carbonPriceEurPerT ?? 0)}/t · refresh interval{' '}
          {health?.refresh_interval_seconds ?? '—'}s · next ETA {formatEta(health?.next_refresh_eta_seconds)} · health{' '}
          {health == null ? 'n/a' : health.healthy ? 'ok' : 'attention'}
          {health?.runs_total != null ? ` · runs ${health.runs_ok}/${health.runs_total}` : ''}
        </p>
        {health?.note ? <p className="mt-1 text-xs text-slate-500">{health.note}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/sources" className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white">
            Trust center →
          </a>
          <a
            href="/crisis/saf-tipping-point?lh=1"
            className="rounded-lg border border-amber-700/50 px-3 py-1.5 text-xs font-medium text-amber-100"
          >
            LH Q2 2026 playbook
          </a>
        </div>
      </section>

      {event && (
        <section className="mb-6 rounded-xl border border-sky-800/60 bg-sky-950/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">
            Aviation event · curated only · as_of {event.as_of ?? 'n/a'}
          </p>
          <h2 className="mt-1 text-base font-semibold text-white">
            {event.entity?.name ?? 'Lufthansa'} — {event.source?.title ?? event.id}
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Q2 adj. profit €{String(facts.q2_adjusted_operating_profit_eur_m ?? '—')}m (
            {String(facts.q2_adjusted_operating_profit_yoy_change_pct ?? '—')}%) · extra kerosene €
            {String(facts.q2_extra_kerosene_cost_iran_war_eur_m ?? '—')}m · strikes ~€
            {String(facts.q2_strike_cost_eur_m_approx ?? '—')}m · pass-through ~
            {String(facts.kerosene_cost_pass_through_pct_approx ?? '—')}% · FY fuel €
            {String(facts.fy_fuel_cost_expected_eur_bn ?? '—')}bn
          </p>
          {decision?.residual_fuel_cost_exposure != null && (
            <p className="mt-2 text-sm text-amber-200">
              Residual fuel-cost exposure (model index): {formatNumber(decision.residual_fuel_cost_exposure, 3)} ·
              pass-through{' '}
              {decision.fare_pass_through_pct != null
                ? `${Math.round(decision.fare_pass_through_pct * 100)}%`
                : 'n/a'}
            </p>
          )}
        </section>
      )}

      {alertBanners.length > 0 && (
        <section className="mb-6 space-y-3">
          {alertBanners.map((banner, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-4 ${
                banner.level === 'alert'
                  ? 'border-rose-800 bg-rose-950/40'
                  : 'border-amber-800 bg-amber-950/40'
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      banner.level === 'alert' ? 'text-rose-300' : 'text-amber-300'
                    }`}
                  >
                    {banner.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-200">{banner.message}</p>
                </div>
                {banner.href && (
                  <a
                    href={banner.href}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                      banner.level === 'alert'
                        ? 'bg-rose-600 text-white hover:bg-rose-500'
                        : 'bg-amber-600 text-white hover:bg-amber-500'
                    }`}
                  >
                    查看详情 →
                  </a>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="市场快照"
          value={`$${formatNumber(market.brent_usd_per_bbl)}/bbl`}
          hint={`Jet(全球) $${formatNumber(market.jet_usd_per_l, 3)}/L | Jet(EU 代理) $${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)}/L | 碳价 $${formatNumber(market.carbon_proxy_usd_per_t)}/tCO2`}
        />
        <MetricCard
          label="情景模式"
          value={`${readModel.scenarioCount}`}
          hint={readModel.scenarioCount > 0 ? '已有保存情景，可用于对比。' : '暂无保存情景；需要假设推演时可从情景工作区开始。'}
        />
        <MetricCard label="管理控制" value="必需" hint="路线成本、政策参数、来源维护" />
        <MetricCard
          label="交付状态"
          value={readModel.isFallback ? '回退' : '实时切片'}
          hint={dashboardFallbackHint(readModel)}
        />
        <MetricCard
          label="最高风险信号"
          value={riskValue}
          hint={riskHint}
          valueClassName={riskColor}
          valueHref={riskHref}
        />
        <MetricCard
          label="德国航油价格页"
          value="打开实时页面"
          hint="服务端市场页，展示 Brent、全球航油、EU 航油代理价、碳价及 1d/7d/30d 变化"
          cardHref="/prices/germany-jet-fuel"
        />
      </section>

      <section className="mt-8">
        <ProvenanceSummary
          summary={sourcesReadModel.summary}
          completeness={sourcesReadModel.completeness}
          generatedAt={sourcesReadModel.generatedAt}
          href="/sources"
        />
      </section>

      <section className="mt-8">
        <PriceTrendsChart
          metrics={priceChartData.metrics}
          isLoading={false}
          error={priceChartData.error}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <InfoCard title="决策驾驶舱能力" subtitle="产品能力">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">
            {priorities.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="数据来源" subtitle="市场覆盖">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>• 覆盖健康时，实时指标优先使用主要或官方来源。</p>
            <p>• 代理指标与回退值分开标注。</p>
            <p>• 置信度、滞后时间与降级原因可在 Sources 页查看。</p>
            <p>• 回退值用于保持驾驶舱可用，但不会对决策用户隐藏。</p>
          </div>
        </InfoCard>
      </section>

      <section className="mt-8">
        <InfoCard title="最近情景" subtitle="来自 FastAPI / PostgreSQL">
          {readModel.recentScenarioNames.length ? (
            <ul className="space-y-2 text-sm leading-7 text-slate-300">
              {readModel.recentScenarioNames.map((name) => (
                <li key={name}>• {name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-7 text-slate-300">
              暂无保存情景。可通过 scenario API 创建一个情景，用于端到端验证 CRUD。
            </p>
          )}
        </InfoCard>
      </section>

      {pathwayComparison ? (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">路径对比</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">SAF 路径净成本与来源可信度</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                以当前市场切片计算各 SAF 路径的净成本与价差，并标注每条路径的来源类型与置信度。
              </p>
            </div>
            <span className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
              对比信号：{pathwayComparison.signalLabel}
            </span>
          </div>
          <SafPathwayComparisonTable
            selectedPathwayKey="hefa"
            pathways={pathwayComparison.rows.map((row) => ({
              pathway_key: row.pathway_key,
              display_name: row.name,
              net_cost_low_usd_per_l: row.min_usd_per_l,
              net_cost_high_usd_per_l: row.max_usd_per_l,
              spread_low_pct: row.spread_pct ?? 0,
              spread_high_pct: row.spread_pct ?? 0,
              status: row.status
            }))}
            sources={pathwayComparison.sourceByKey}
          />
        </section>
      ) : null}

      {euEtsPressure ? (
        <section className="mt-8">
          <EuEtsPressurePanel model={euEtsPressure} />
        </section>
      ) : null}

      <section className="mt-12">
        <PolicyTimelineWithMarketTime />
      </section>
    </Shell>
  );
}
