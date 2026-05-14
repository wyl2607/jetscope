import { Shell } from '@/components/shell';
import { getDashboardReadModel, toDecisionReadModel, toTippingPointReadModel } from '@/lib/product-read-model';
import {
  formatSourceCoverageLag,
  getSourceCoverageTrustState,
  type SourceCoverageMetric,
  type SourceCoverageTrustState
} from '@/lib/source-coverage-contract';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';
import { TippingPointWorkbench } from '@/components/tipping-point-workbench';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'SAF 临界点分析',
  description:
    '交互式分析传统航油价格在何种条件下会让可持续航空燃料（SAF）对欧洲航司具备经济竞争力。',
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

function sourceTrustTone(state: SourceCoverageTrustState): string {
  if (state === 'live') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (state === 'proxy') return 'border-sky-200 bg-sky-50 text-sky-800';
  if (state === 'fallback') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-700';
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
  if (metric.source_type.includes('proxy') || metric.source_type === 'derived') return '代理来源，适合情景分析';
  return '主来源可用';
}

export default async function SafTippingPointPage() {
  const readModel = await getDashboardReadModel();
  const tippingPoint = toTippingPointReadModel(readModel.tippingPoint);
  const airlineDecision = toDecisionReadModel(readModel.airlineDecision);
  const liveFuel = readModel.market.values?.jet_eu_proxy_usd_per_l ?? readModel.market.values?.jet_usd_per_l ?? 1.3;
  const liveCarbonUsd = readModel.market.values?.carbon_proxy_usd_per_t ?? 102.6;
  const sourceCoverageItems = (readModel.sourceCoverage?.metrics ?? [])
    .filter((metric) => SAF_SOURCE_METRICS.includes(metric.metric_key as (typeof SAF_SOURCE_METRICS)[number]))
    .map((metric) => ({
      metric,
      trustState: getSourceCoverageTrustState(metric)
    }));
  const degradedSourceCount = sourceCoverageItems.filter(({ trustState }) => trustState !== 'live').length;
  const sourceCoverageSummary = readModel.sourceCoverage
    ? `${degradedSourceCount} / ${sourceCoverageItems.length} 个计算输入需要复核`
    : '来源覆盖暂不可用，当前计算应视为情景基线';

  return (
    <Shell
      eyebrow="危机分析"
      title="SAF 临界点"
      description="定位可持续航空燃料（SAF）成为欧洲航空运营方理性选择的关键价格区间。"
    >
      {/* Top navigation */}
      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/crisis/eu-jet-reserves"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-500 hover:text-slate-950"
        >
          ← 储备监测
        </Link>
        <Link
          href="/de/lufthansa-saf-2026"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-500 hover:text-slate-950"
        >
          Lufthansa 分析 →
        </Link>
      </div>

      {/* Introduction */}
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-bold text-slate-950">核心问题</h2>
        <p className="mt-3 text-slate-700 leading-relaxed">
          在什么燃油价格、碳价与供应约束下，SAF 会从
          <strong className="text-slate-800">合规成本</strong>转为
          <strong className="text-emerald-700">理性采购选择</strong>？
        </p>
        <p className="mt-4 text-sm text-slate-600">
          本页提供交互工具，用于评估航空燃料转型经济性。
          市场输入优先使用实时来源；当来源降级时，计算会明确标出代理或回退路径。
        </p>
      </section>

      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">计算输入</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">本次计算可信度</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{sourceCoverageSummary}</p>
          </div>
          <Link
            href={REVIEW_SOURCES_ROUTE}
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:border-sky-500 hover:bg-sky-100"
          >
            查看需复核来源
          </Link>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {sourceCoverageItems.length ? (
            sourceCoverageItems.map(({ metric, trustState }) => (
              <article key={metric.metric_key} className={`rounded-xl border p-4 ${sourceTrustTone(trustState)}`}>
                <p className="text-xs uppercase tracking-[0.14em] opacity-75">{sourceTrustLabel(trustState)}</p>
                <h3 className="mt-2 text-sm font-semibold">{sourceMetricLabel(metric.metric_key)}</h3>
                <p className="mt-2 text-xs opacity-80">{metric.source_name}</p>
                <p className="mt-2 text-xs opacity-80">
                  置信度 {Math.round(metric.confidence_score * 100)}% · 滞后 {formatSourceCoverageLag(metric.lag_minutes)}
                </p>
                <p className="mt-2 text-xs opacity-80">{sourceStatusCopy(metric)}</p>
              </article>
            ))
          ) : (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              未能读取来源覆盖合约。请先检查 API readiness 和来源页。
            </p>
          )}
        </div>
      </section>

      <TippingPointWorkbench
        initialTippingPoint={tippingPoint}
        initialDecision={airlineDecision}
        initialReserveWeeks={readModel.reserve?.coverage_weeks ?? 3.0}
        liveDefaults={{
          fossilJetUsdPerL: liveFuel,
          carbonPriceEurPerT: Number((liveCarbonUsd / 1.08).toFixed(2)),
          subsidyUsdPerL: 0,
          blendRatePct: 6,
          reserveWeeks: readModel.reserve?.coverage_weeks ?? 3.0,
          pathwayKey: 'hefa'
        }}
      />

      {/* Model Boundaries */}
      <section className="rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-bold text-slate-950 mb-4">模型边界与使用建议</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-2">输入解释</h3>
            <p className="text-sm text-slate-700">
              计算面板优先采用实时市场来源；当实时来源不可用时，会显示代理、回退或降级状态。
              进入来源页可复核每个输入的来源、滞后与置信度。
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-2">SAF 路径</h3>
            <p className="text-sm text-slate-700">
              成本曲线基于 2026 年研究（Energy Solutions、RMI、EASA）。
              路径成熟度分级：commercial、scaling、limited、future。
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-2">储备信号</h3>
            <p className="text-sm text-slate-700">
              EU 航油储备估算由 IATA 与 EUROCONTROL 评估人工维护。
              每周更新。人工信号置信度为 0.62。
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-2">分析模型</h3>
            <p className="text-sm text-slate-700">
              临界点与航司决策引擎作为共享 Python 服务运行。
              模型与 API 合约由后端分析服务维护。
            </p>
          </div>
        </div>
      </section>
    </Shell>
  );
}
