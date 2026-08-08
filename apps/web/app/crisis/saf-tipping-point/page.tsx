import { MetricCard } from '@/components/cards';
import { EuEtsPressurePanel } from '@/components/eu-ets-pressure-panel';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SafPathwayComparisonTable } from '@/components/saf-pathway-comparison-table';
import { SourceFooter } from '@/components/source-footer';
import { TippingPointWorkbench } from '@/components/tipping-point-workbench';
import { loadEuEtsPressure } from '@/lib/eu-ets-pressure-read-model';
import { loadPathwayComparison, toPathwayCostRow } from '@/lib/pathways-read-model';
import { getDashboardReadModel, toDecisionReadModel, toTippingPointReadModel } from '@/lib/product-read-model';
import { buildPageMetadata } from '@/lib/seo';
import {
  formatSourceCoverageLag,
  getSourceCoverageTrustState,
  type SourceCoverageMetric,
  type SourceCoverageTrustState
} from '@/lib/source-coverage-contract';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'SAF 临界点分析',
  description: '交互式分析传统航油价格在何种条件下会让可持续航空燃料（SAF）对欧洲航司具备经济竞争力。',
  path: '/crisis/saf-tipping-point'
});

const SAF_SOURCE_METRICS = [
  'jet_eu_proxy_usd_per_l',
  'jet_usd_per_l',
  'carbon_proxy_usd_per_t',
  'eu_ets_price_eur_per_t',
  'rotterdam_jet_fuel_usd_per_l'
] as const;

const REVIEW_SOURCES_ROUTE = '/sources?filter=review' as Route;

function sourceTrustLabel(state: SourceCoverageTrustState): string {
  if (state === 'live') return '实时';
  if (state === 'proxy') return '代理';
  if (state === 'fallback') return '回退';
  return '降级';
}

// SourceCoverageTrustState has exactly four business states. Proxy is a
// warning because it is not a direct observation; the other three each retain
// their own explicit meaning instead of falling through to a neutral color.
function sourceTrustTone(state: SourceCoverageTrustState): string {
  if (state === 'live') return 'border-line bg-success-soft text-success';
  if (state === 'proxy') return 'border-line bg-warning-soft text-warning';
  if (state === 'fallback') return 'border-line bg-warning-soft text-warning';
  return 'border-line bg-danger-soft text-danger';
}

function sourceMetricLabel(metricKey: string): string {
  if (metricKey === 'jet_eu_proxy_usd_per_l') return 'EU 航煤代理';
  if (metricKey === 'jet_usd_per_l') return '全球航煤';
  if (metricKey === 'carbon_proxy_usd_per_t') return '碳价代理';
  if (metricKey === 'eu_ets_price_eur_per_t') return 'EU ETS';
  if (metricKey === 'rotterdam_jet_fuel_usd_per_l') return 'Rotterdam 航煤';
  return metricKey;
}

function sourceStatusCopy(metric: SourceCoverageMetric): string {
  if (metric.fallback_used) return '用于计算前请复核回退路径';
  if (metric.status !== 'ok') return '来源暂不可用或已降级';
  if (metric.source_type.includes('proxy') || metric.source_type === 'derived') return '代理来源，只适合情景分析';
  return '主来源可用';
}

function tippingSignalTone(signal?: string): string {
  if (signal === 'saf_cost_advantaged') return 'text-success';
  if (signal === 'switch_window_opening') return 'text-warning';
  if (signal === 'fossil_still_advantaged') return 'text-danger';
  return 'text-warning';
}

export default async function SafTippingPointPage() {
  const readModel = await getDashboardReadModel();
  const tippingPoint = toTippingPointReadModel(readModel.tippingPoint);
  const airlineDecision = toDecisionReadModel(readModel.airlineDecision);
  const fuelSource = readModel.market.values?.jet_eu_proxy_usd_per_l != null
    ? 'proxy'
    : readModel.market.values?.jet_usd_per_l != null
      ? 'spot'
      : 'assumed';
  const liveFuel = readModel.market.values?.jet_eu_proxy_usd_per_l ?? readModel.market.values?.jet_usd_per_l ?? 1.3;
  const carbonIsAssumed = readModel.market.values?.carbon_proxy_usd_per_t == null;
  const liveCarbonUsd = readModel.market.values?.carbon_proxy_usd_per_t ?? 102.6;
  const reserveIsAssumed = readModel.reserve == null;
  const anyInputIsAssumed = readModel.isFallback || fuelSource === 'assumed' || carbonIsAssumed || reserveIsAssumed;
  const asOf = anyInputIsAssumed ? null : readModel.market.generated_at;
  const sourceCoverageItems = (readModel.sourceCoverage?.metrics ?? [])
    .filter((metric) => SAF_SOURCE_METRICS.includes(metric.metric_key as (typeof SAF_SOURCE_METRICS)[number]))
    .map((metric) => ({ metric, trustState: getSourceCoverageTrustState(metric) }));
  const degradedSourceCount = sourceCoverageItems.filter(({ trustState }) => trustState !== 'live').length;
  const sourceCoverageSummary = readModel.sourceCoverage
    ? `${degradedSourceCount} / ${sourceCoverageItems.length} 个计算输入需要复核`
    : '来源覆盖暂不可用，当前计算应视为情景基线';
  const assumedInputCopy = [
    fuelSource === 'assumed' ? '化石航油使用内置假设 1.3 USD/L' : null,
    carbonIsAssumed ? '碳价使用内置假设 102.6 USD/t' : null,
    reserveIsAssumed ? '储备覆盖使用内置假设 3.0 周' : null
  ].filter(Boolean).join('；');

  let pathwayComparison: Awaited<ReturnType<typeof loadPathwayComparison>> | null = null;
  try {
    pathwayComparison = await loadPathwayComparison({
      fossilJetUsdPerL: liveFuel,
      carbonPriceEurPerT: Number((liveCarbonUsd / 1.08).toFixed(2)),
      subsidyUsdPerL: 0,
      blendRatePct: 6
    });
  } catch {
    pathwayComparison = null;
  }

  let euEtsPressure: Awaited<ReturnType<typeof loadEuEtsPressure>> | null = null;
  try {
    euEtsPressure = await loadEuEtsPressure({
      fossilJetUsdPerL: liveFuel,
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
      eyebrow="危机分析"
      title="SAF 临界点"
      question="当前燃油、碳价与储备条件是否已经足以启动 SAF 采购切换？"
      asOf={asOf}
    >
      <SignalRow label="SAF 临界点结论">
        <MetricCard
          label="当前临界点信号"
          value={tippingPoint?.signal ?? '未识别'}
          valueClassName={tippingSignalTone(tippingPoint?.signal)}
          hint="结论优先；未知信号仍是需复核的问题态。"
        />
        <MetricCard
          label="输入可信度"
          value={anyInputIsAssumed ? '仅供情景讨论' : sourceCoverageSummary}
          valueClassName={anyInputIsAssumed || degradedSourceCount > 0 ? 'text-warning' : 'text-success'}
          hint={assumedInputCopy || sourceCoverageSummary}
          cardHref={REVIEW_SOURCES_ROUTE}
        />
        <MetricCard
          label="储备覆盖"
          value={`${(readModel.reserve?.coverage_weeks ?? 3.0).toFixed(1)} 周`}
          valueClassName={reserveIsAssumed ? 'text-warning' : 'text-ink'}
          hint={reserveIsAssumed ? '内置假设 3.0 周，模拟结论不能当作当前市场结论。' : '已连接储备来源。'}
        />
      </SignalRow>

      <Panel
        title="相关决策入口"
        why="在修改模拟假设前，先对照储备危机页与航司事件分析，确认问题来自市场输入还是运营约束。"
      >
        <div className="flex flex-wrap gap-4">
          <Link href="/crisis/eu-jet-reserves" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:bg-accent-soft">← 储备监测</Link>
          <Link href="/de/lufthansa-saf-2026" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:bg-accent-soft">Lufthansa 分析 →</Link>
        </div>
      </Panel>

      <Panel
        title="本次计算可信度"
        why={assumedInputCopy || '逐项核对直接观测、代理、回退和降级输入；代理来源不能被读成正常实测。'}
        action={<Link href={REVIEW_SOURCES_ROUTE} className="rounded-xl border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:bg-accent-soft">查看需复核来源</Link>}
      >
        {sourceCoverageItems.length ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
            {sourceCoverageItems.map(({ metric, trustState }) => (
              <article key={metric.metric_key} className={`rounded-2xl border p-4 ${sourceTrustTone(trustState)}`}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">{sourceTrustLabel(trustState)}</p>
                <h3 className="mt-2 text-sm font-semibold text-ink">{sourceMetricLabel(metric.metric_key)}</h3>
                <p className="mt-2 text-xs text-muted">{metric.source_name}</p>
                <p className="mt-2 text-xs tabular-nums text-muted">置信度 {Math.round(metric.confidence_score * 100)}% · 滞后 {formatSourceCoverageLag(metric.lag_minutes)}</p>
                <p className="mt-2 text-xs text-muted">{sourceStatusCopy(metric)}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-danger bg-danger-soft p-4 text-sm text-danger" role="alert">未能读取来源覆盖合约。请先检查 API readiness 和来源页。</p>
        )}
      </Panel>

      <Panel
        title="交互式拐点工作台"
        why={reserveIsAssumed ? '储备覆盖未取到实时值，使用内置假设 3.0 周；模拟结果仅供情景讨论。' : '调整燃油、碳价、补贴、掺混率与储备假设，观察切换结论在什么条件下翻转。'}
      >
        <TippingPointWorkbench
          initialTippingPoint={tippingPoint}
          initialDecision={airlineDecision}
          initialReserveWeeks={readModel.reserve?.coverage_weeks ?? 3.0}
          reserveIsScenarioDefault={!readModel.reserve}
          liveDefaults={{
            fossilJetUsdPerL: liveFuel,
            carbonPriceEurPerT: Number((liveCarbonUsd / 1.08).toFixed(2)),
            subsidyUsdPerL: 0,
            blendRatePct: 6,
            reserveWeeks: readModel.reserve?.coverage_weeks ?? 3.0,
            pathwayKey: 'hefa'
          }}
        />
      </Panel>

      <Panel
        title="SAF 路径净成本与来源可信度"
        why="以当前市场输入算出各路径的净成本区间与价差，并标注来源类型与置信度；便宜但来源不可信的路径不该赢。"
        state={pathwayComparison ? 'ready' : 'error'}
        stateDetail="路径比较服务当前不可用，不能用空白结果替代路径判断。"
        action={pathwayComparison ? <span className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted">对比信号：{pathwayComparison.signalLabel}</span> : null}
      >
        {pathwayComparison ? (
          <SafPathwayComparisonTable
            selectedPathwayKey="hefa"
            pathways={pathwayComparison.rows.map((row) =>
              toPathwayCostRow(
                {
                  pathway_key: row.pathway_key,
                  display_name: row.name,
                  net_cost_low_usd_per_l: row.min_usd_per_l,
                  net_cost_high_usd_per_l: row.max_usd_per_l,
                  spread_low_pct: row.spread_pct ?? 0,
                  spread_high_pct: row.spread_pct ?? 0,
                  status: row.status
                },
                { asOf: pathwayComparison.generatedAt, basis: 'observed' }
              )
            )}
            sources={pathwayComparison.sourceByKey}
          />
        ) : null}
      </Panel>

      <Panel
        title="碳价对化石航油的成本压力"
        why="EU ETS 是所有临界点结论背后的共同驱动量；逐档查看它把化石航油有效成本推高多少。"
        state={euEtsPressure ? 'ready' : 'error'}
        stateDetail="EU ETS 压力模型当前不可用，无法核对碳价传导。"
      >
        {euEtsPressure ? <EuEtsPressurePanel model={euEtsPressure} /> : null}
      </Panel>

      <Panel title="模型边界与使用建议" why="明确哪些输入是市场观测、哪些是代理或人工假设，避免把模拟输出当成采购指令。">
        <div className="grid gap-6 md:grid-cols-2">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">输入解释</p><p className="mt-2 text-sm leading-6 text-muted">实时来源不可用时会显示代理、回退或降级状态；进入来源页复核滞后与置信度。</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">SAF 路径</p><p className="mt-2 text-sm leading-6 text-muted">成本曲线基于研究边界，路径成熟度与价格区间仍需项目级核验。</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">储备信号</p><p className="mt-2 text-sm leading-6 text-muted">人工维护的储备估算是情景假设，不是官方实时库存。</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">分析模型</p><p className="mt-2 text-sm leading-6 text-muted">临界点与航司决策引擎用于敏感性分析，不构成采购建议。</p></div>
        </div>
      </Panel>

      <SourceFooter
        sources={[
          {
            id: 'saf-tipping-fuel',
            label: fuelSource === 'assumed' ? '化石航油内置假设 1.3 USD/L' : fuelSource === 'proxy' ? 'EU 航油代理输入' : '全球航油市场输入',
            asOf: fuelSource === 'assumed' ? null : asOf,
            basis: readModel.isFallback || fuelSource === 'assumed' ? 'assumption' : fuelSource === 'spot' ? 'observed' : 'derived'
          },
          {
            id: 'saf-tipping-carbon',
            label: carbonIsAssumed ? '碳价内置假设 102.6 USD/t' : '碳价代理输入',
            asOf: carbonIsAssumed ? null : asOf,
            basis: readModel.isFallback || carbonIsAssumed ? 'assumption' : 'derived'
          },
          {
            id: 'saf-tipping-reserve',
            label: reserveIsAssumed ? '储备覆盖内置假设 3.0 周' : `储备覆盖（${readModel.reserve?.source_name ?? '来源不可用'}）`,
            asOf: reserveIsAssumed ? null : readModel.reserve?.generated_at,
            basis: reserveIsAssumed ? 'assumption' : readModel.reserve?.source_type === 'official' ? 'observed' : readModel.reserve?.source_type === 'derived' ? 'derived' : 'assumption'
          },
          { id: 'source-coverage-contract', label: '计算输入来源覆盖、滞后与置信度合约', asOf: readModel.sourceCoverage?.generated_at ?? null, basis: 'derived' },
          { id: 'saf-tipping-model', label: 'SAF 临界点、路径比较与 EU ETS 压力模型', basis: 'derived' }
        ]}
        methodHref="/sources"
        methodLabel="口径与来源清单"
        limitations={[
          '储备覆盖未取到实时值时，模拟器使用 3.0 周内置假设，模拟结果仅供情景讨论。',
          '化石航油或碳价落到内置值时，页面不显示 as-of 戳，相关结论不能当作当前市场观测。',
          '滑块和输入框中的燃油、碳价、补贴、掺混率与储备值是读者设定的假设。',
          '模型输出不替代航司合同、库存、供应商报价或采购审批。'
        ]}
      />
    </PageTemplate>
  );
}
