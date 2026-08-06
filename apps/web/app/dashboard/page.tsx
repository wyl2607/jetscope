import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { SourceFooter } from '@/components/source-footer';
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
import Link from 'next/link';
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
  const sourceStatus = readModel.market.source_status;

  const riskColor =
    risk == null ? 'text-warning' : risk.level === 'alert' ? 'text-danger' : risk.level === 'watch' ? 'text-warning' : 'text-success';
  const riskValue =
    risk == null
      ? 'n/a'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHref = risk == null ? undefined : `/sources?focus=${encodeURIComponent(risk.metricKey)}`;
  const riskHint =
    risk == null
      ? '暂无历史风险信号'
      : `级别：${riskLevelLabel(risk.level)} · 截至：${formatAsOf(risk.latestAsOf)} · 样本：${risk.sampleCount}`;
  const scenarioNeedsReview =
    readModel.isFallback || sourceStatus.overall !== 'ok' || risk == null || risk.level !== 'normal';
  const decisionPosture = risk?.level === 'alert' ? '建议重跑' : scenarioNeedsReview ? '先复核' : '可沿用';
  const decisionTone =
    risk?.level === 'alert' || sourceStatus.overall === 'offline'
      ? 'text-danger'
      : scenarioNeedsReview
        ? 'text-warning'
        : 'text-success';
  const decisionHint = readModel.isFallback
    ? '当前使用内置回退值，不能把它当作重跑情景的实测输入。'
    : risk?.level === 'alert'
      ? '历史窗口已出现警报，先复核来源，再用当前市场输入重跑情景。'
      : risk == null
        ? '历史窗口尚未形成可识别信号，不能把未知当作正常。'
        : sourceStatus.overall !== 'ok'
          ? '来源状态未达正常，先完成来源复核，再决定是否沿用情景。'
          : risk.level === 'watch'
            ? '风险处于观察区间，先复核关键假设，再决定是否重跑。'
            : '来源和风险窗口均未触发复核条件。';
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

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
  const statusTone: 'success' | 'warning' | 'danger' =
    readModel.isFallback || sourceStatus.overall === 'offline'
      ? 'danger'
      : sourceStatus.overall === 'ok' && health?.healthy !== false
        ? 'success'
        : 'warning';
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
    <PageTemplate
      question="今天的市场和数据交付状况，有没有变到需要重跑情景的程度？"
      asOf={asOf}
      eyebrow="市场情报"
      title="JetScope 决策驾驶舱"
    >
      <StatusBanner
        tone={statusTone}
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
         快照时间 <strong>{formatAsOf(asOf)}</strong> · 数据新鲜度{' '}
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

      <SignalRow label="决策信号">
        <MetricCard
          label="情景动作"
          value={decisionPosture}
          hint={decisionHint}
          valueClassName={decisionTone}
        />
        <MetricCard
          label="交付状态"
          value={readModel.isFallback ? '回退' : '实时切片'}
          hint={dashboardFallbackHint(readModel)}
          valueClassName={readModel.isFallback ? 'text-danger' : sourceStatus.overall === 'ok' ? 'text-success' : 'text-warning'}
        />
        <MetricCard
          label="最高风险信号"
          value={riskValue}
          hint={riskHint}
          valueClassName={riskColor}
          valueHref={riskHref}
        />
        <MetricCard
          label="市场快照"
          value={`$${formatNumber(market.brent_usd_per_bbl)}/bbl`}
          hint={`Jet(全球) $${formatNumber(market.jet_usd_per_l, 3)}/L | Jet(EU 代理) $${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)}/L | 碳价 $${formatNumber(market.carbon_proxy_usd_per_t)}/tCO2`}
        />
      </SignalRow>

      <Panel title="工作入口" why="这些入口把当前市场读数连接到管理参数和德国航油价格的可复核页面。">
        <div className="grid gap-6 md:grid-cols-2">
        <MetricCard label="管理控制" value="打开管理" hint="路线成本、政策参数、来源维护" cardHref="/admin" />
        <MetricCard
          label="德国航油价格页"
          value="打开实时页面"
          hint="展示 Brent、全球航油、EU 航油代理价、碳价及 1d/7d/30d 变化"
          cardHref="/prices/germany-jet-fuel"
        />
        </div>
      </Panel>

      <Panel title="来源溯源" why="这一屏所有数字的可信状态：多少是实测、多少是代理、多少是回退。">
        <ProvenanceSummary
          summary={sourcesReadModel.summary}
          completeness={sourcesReadModel.completeness}
          generatedAt={sourcesReadModel.isFallback ? '' : sourcesReadModel.generatedAt}
          href="/sources"
        />
      </Panel>

      <Panel title="价格趋势" why="上面的快照只是一个点；要判断它是不是异常，得看它在 1d / 7d / 30d 窗口里的位置。">
        <PriceTrendsChart
          metrics={priceChartData.metrics}
          isLoading={false}
          error={priceChartData.error}
        />
      </Panel>

      <Panel title="决策驾驶舱能力" why="这是当前产品能力清单，说明驾驶舱能覆盖哪些工作，不替代本页的市场决策结论。">
        <ul className="space-y-3 text-sm leading-7 text-muted">
          {priorities.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="最近情景"
        why="这些是可供对比的已保存假设；它们说明情景准备度，不等于已经批准的采购决定。"
        action={
        <Link
          href="/scenarios"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted transition hover:border-accent hover:bg-accent-soft"
        >
          打开情景工作区
        </Link>
        }
      >
        {readModel.recentScenarioNames.length ? (
        <ul className="space-y-2 text-sm leading-7 text-muted">
          {readModel.recentScenarioNames.map((name) => (
            <li key={name}>• {name}</li>
          ))}
        </ul>
        ) : (
        <p className="text-sm leading-7 text-muted">
          暂无保存情景。可通过 scenario API 创建一个情景，用于端到端验证 CRUD。
        </p>
        )}
      </Panel>

      {pathwayComparison ? (
        <Panel
          title="SAF 路径净成本与来源可信度"
          why="以当前市场切片算出各路径的净成本与价差，并标注来源类型与置信度——便宜但来源不可信的路径不该赢。"
          action={
              <span className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted">
              对比信号：{pathwayComparison.signalLabel}
            </span>
          }
        >
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
        </Panel>
      ) : null}

      {euEtsPressure ? (
          <Panel
            title="碳价对化石航油的成本压力"
            why="EU ETS 是同时推动 SAF 与电网平价的那一个驱动量；这里逐档看它把化石航油推高多少。"
          >
            <EuEtsPressurePanel model={euEtsPressure} />
          </Panel>
      ) : null}

      <Panel
        title="政策里程碑时间线"
        why="哪条规则什么时候生效，按上方市场快照的时间点对齐——已经过期的期限不该看起来像未来的。"
        >
        <PolicyTimelineWithMarketTime />
        </Panel>

      <SourceFooter
        sources={[
        {
          id: 'dashboard-read-model',
          label: readModel.isFallback
            ? `市场快照接口无响应，当前为内置兜底值（${readModel.error ?? '未知原因'}）`
            : '市场快照接口（市场读数、来源状态、新鲜度）',
          asOf,
          basis: readModel.isFallback ? 'assumption' : 'observed'
        },
        {
          id: 'source-coverage',
          label: sourcesReadModel.isFallback
            ? `来源覆盖接口无响应，当前为兜底摘要（${sourcesReadModel.error ?? '未知原因'}）`
            : '来源覆盖汇总（实测、代理、回退、置信度）',
          asOf: sourcesReadModel.isFallback ? null : sourcesReadModel.generatedAt,
          basis: sourcesReadModel.isFallback ? 'assumption' : 'derived'
        },
        {
          id: 'risk-signal',
          label: '风险信号由市场历史窗口的变动幅度推导，非上游直接给出',
          basis: 'derived'
        },
        {
          id: 'scenario-store',
          label: `本地情景库（当前 ${readModel.scenarioCount} 个已保存情景）`,
          basis: 'assumption'
        }
        ]}
        methodHref="/sources"
        methodLabel="口径与来源清单"
        limitations={[
        '覆盖健康时，实时指标优先使用主要或官方来源。',
        '代理指标与回退值分开标注。',
        '置信度、滞后时间与降级原因可在 Sources 页查看。',
        '回退值用于保持驾驶舱可用，但不会对决策用户隐藏。',
        '风险信号依赖历史窗口样本量，样本不足时不会产生警报，不等于没有风险。',
        '情景库是本地保存的假设，用于复盘和讨论，不替代真实采购审批。'
        ]}
      />
    </PageTemplate>
  );
}
