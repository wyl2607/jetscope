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
import { StatusBanner } from '@/components/status-banner';
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
      <StatusBanner
        tone={health?.healthy === false ? 'warning' : 'success'}
        label="实时市场状态"
        title={`${sourceStatusLabel(readModel.market.source_status.overall)} · ${freshnessLabel(freshness.level)}`}
        detail={
          <>
            分析航油：{analysis?.jetSourceKey ?? 'n/a'}=${formatNumber(
              analysis?.fossilJetUsdPerL ?? market.jet_eu_proxy_usd_per_l ?? 0,
              3
            )}/L · ETS €{formatNumber(analysis?.carbonPriceEurPerT ?? 0)}/t · 刷新间隔{' '}
            {health?.refresh_interval_seconds ?? '—'}s · 下次预计 {formatEta(health?.next_refresh_eta_seconds)} · 健康度{' '}
            {health == null ? 'n/a' : health.healthy ? 'ok' : 'attention'}
            {health?.runs_total != null ? ` · runs ${health.runs_ok}/${health.runs_total}` : ''}
          </>
        }
        actions={
          <>
            <a href="/sources" className="js-status-action js-status-action-primary">
              查看来源 →
            </a>
            <a href="/crisis/saf-tipping-point?lh=1" className="js-status-action js-status-action-secondary">
              LH Q2 2026 →
            </a>
          </>
        }
      >
        快照时间 <strong>{formatAsOf(readModel.market.generated_at)}</strong> · 数据新鲜度{' '}
        <strong>{freshnessLabel(freshness.level)}</strong>（{freshness.minutes}m） · 来源总体{' '}
        <code>{sourceStatusLabel(readModel.market.source_status.overall)}</code>
        {spread != null && (
          <>
            {' · '}Jet–Brent spread <strong>${formatNumber(spread, 3)}/L</strong>
            {multiplier != null ? ` (×${formatNumber(multiplier, 3)})` : ''}
          </>
        )}
      </StatusBanner>

      {health?.note ? <p className="js-dashboard-note">{health.note}</p> : null}

      {event && (
        <StatusBanner
          tone="info"
          label={`航空事件 · 仅策展数据 · as_of ${event.as_of ?? 'n/a'}`}
          title={`${event.entity?.name ?? 'Lufthansa'} — ${event.source?.title ?? event.id}`}
        >
          Q2 adj. profit €{String(facts.q2_adjusted_operating_profit_eur_m ?? '—')}m (
          {String(facts.q2_adjusted_operating_profit_yoy_change_pct ?? '—')}%) · extra kerosene €
          {String(facts.q2_extra_kerosene_cost_iran_war_eur_m ?? '—')}m · strikes ~€
          {String(facts.q2_strike_cost_eur_m_approx ?? '—')}m · pass-through ~
          {String(facts.kerosene_cost_pass_through_pct_approx ?? '—')}% · FY fuel €
          {String(facts.fy_fuel_cost_expected_eur_bn ?? '—')}bn
          {decision?.residual_fuel_cost_exposure != null && (
            <span className="js-status-inline-emphasis">
              Residual exposure {formatNumber(decision.residual_fuel_cost_exposure, 3)} · pass-through{' '}
              {decision.fare_pass_through_pct != null ? `${Math.round(decision.fare_pass_through_pct * 100)}%` : 'n/a'}
            </span>
          )}
        </StatusBanner>
      )}

      {alertBanners.length > 0 && (
        <div className="js-status-stack">
          {alertBanners.map((banner, idx) => (
            <StatusBanner
              key={idx}
              tone={banner.level === 'alert' ? 'danger' : 'warning'}
              label={banner.title}
              actions={
                banner.href ? (
                  <a href={banner.href} className="js-status-action js-status-action-primary">
                    查看详情 →
                  </a>
                ) : null
              }
            >
              {banner.message}
            </StatusBanner>
          ))}
        </div>
      )}

      <section className="js-dashboard-section">
        <div className="js-section-heading">
          <div>
            <p className="js-section-label">决策信号</p>
            <h2 className="js-section-title">先看四项变化，再进入模型</h2>
            <p className="js-section-description">把当前市场、风险、数据交付和情景准备度放在同一层，减少在页面之间来回寻找。</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="市场快照"
            value={`$${formatNumber(market.brent_usd_per_bbl)}/bbl`}
            hint={`Jet(全球) $${formatNumber(market.jet_usd_per_l, 3)}/L | Jet(EU 代理) $${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)}/L | 碳价 $${formatNumber(market.carbon_proxy_usd_per_t)}/tCO2`}
          />
          <MetricCard
            label="最高风险信号"
            value={riskValue}
            hint={riskHint}
            valueClassName={riskColor}
            valueHref={riskHref}
          />
          <MetricCard
            label="交付状态"
            value={readModel.isFallback ? '回退' : '实时切片'}
            hint={dashboardFallbackHint(readModel)}
          />
          <MetricCard
            label="情景准备度"
            value={`${readModel.scenarioCount} 个情景`}
            hint={readModel.scenarioCount > 0 ? '已有保存情景，可用于对比。' : '暂无保存情景；需要假设推演时可从情景工作区开始。'}
            cardHref="/scenarios"
          />
        </div>
      </section>

      <section className="js-dashboard-section js-dashboard-section-compact">
        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard label="管理控制" value="打开管理" hint="路线成本、政策参数、来源维护" cardHref="/admin" />
          <MetricCard
            label="德国航油价格页"
            value="打开实时页面"
            hint="展示 Brent、全球航油、EU 航油代理价、碳价及 1d/7d/30d 变化"
            cardHref="/prices/germany-jet-fuel"
          />
        </div>
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
