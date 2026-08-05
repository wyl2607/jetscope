import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';
import { Shell } from '@/components/shell';
import { TippingEventTimeline } from '@/components/tipping-event-timeline';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';
import {
  getDashboardReadModel,
  toDecisionReadModel,
  toTippingPointReadModel
} from '@/lib/product-read-model';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { buildResearchDecisionBrief, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '危机监测',
  description:
    '在一个运营危机监测视图中跟踪储备覆盖、临界事件与 SAF 经济性跨越。',
  path: '/crisis'
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const REVIEW_SOURCES_ROUTE = '/sources?filter=review' as Route;

type CrisisActionLink = {
  title: string;
  description: string;
  href: Route;
  tone: string;
  eyebrow: string;
};

function buildSafWorkbenchHref({
  fallbackFossil,
  carbonPriceEurPerT,
  reserveWeeks
}: {
  fallbackFossil: number;
  carbonPriceEurPerT: number;
  reserveWeeks: number | null;
}): Route {
  const params = new URLSearchParams({
    fuel: fallbackFossil.toFixed(3),
    carbon: carbonPriceEurPerT.toFixed(2),
    subsidy: '0.000',
    blend: '6.00',
    reserve: reserveWeeks?.toFixed(2) ?? '3.00',
    pathway: 'hefa'
  });
  return `/crisis/saf-tipping-point?${params.toString()}` as Route;
}

function buildCrisisLinks(safWorkbenchHref: Route, reviewSourcesHref: Route): CrisisActionLink[] {
  return [
    {
      title: '打开储备详情',
      description: '先检查覆盖周数、来源类型、置信度和供应缺口，再调整采购判断。',
      href: '/crisis/eu-jet-reserves' as Route,
      tone: 'border-line bg-surface hover:border-accent hover:bg-accent-soft',
      eyebrow: '储备'
    },
    {
      title: '打开 SAF 工作台',
      description: '带入当前燃油、碳价和储备读数，直接测试 SAF 路径敏感性。',
      href: safWorkbenchHref,
      tone: 'border-line bg-success-soft hover:border-success',
      eyebrow: '模拟'
    },
    {
      title: '复核数据来源',
      description: '查看需要复核的市场输入，确认实时、代理、回退和降级状态。',
      href: reviewSourcesHref,
      tone: 'border-line bg-warning-soft hover:border-warning',
      eyebrow: '来源'
    }
  ];
}

function stressLabel(level?: string): string {
  if (level === 'critical') return '紧急';
  if (level === 'elevated') return '偏高';
  if (level === 'guarded') return '警戒';
  if (level === 'normal') return '平稳';
  return '回退模式';
}

function stressTone(level?: string): string {
  if (level === 'critical') return 'border-danger bg-danger-soft text-danger';
  if (level === 'elevated') return 'border-warning bg-warning-soft text-warning';
  if (level === 'normal') return 'border-success bg-success-soft text-success';
  return 'border-accent bg-accent-soft text-accent';
}

function sourceTypeLabel(sourceType?: string): string {
  if (sourceType === 'official') return '官方来源';
  if (sourceType === 'manual') return '人工估算';
  if (sourceType === 'derived') return '模型推导';
  if (!sourceType) return '情景基线';
  return sourceType;
}

function sourceTone(sourceType?: string): string {
  if (sourceType === 'official') return 'border-success bg-success-soft text-success';
  if (sourceType === 'manual') return 'border-warning bg-warning-soft text-warning';
  if (sourceType === 'derived') return 'border-accent bg-accent-soft text-accent';
  return 'border-danger bg-danger-soft text-danger';
}

function confidenceTone(value?: number): string {
  if (value == null) return 'border-danger bg-danger-soft text-danger';
  if (value >= 0.85) return 'border-success bg-success-soft text-success';
  if (value >= 0.7) return 'border-accent bg-accent-soft text-accent';
  return 'border-warning bg-warning-soft text-warning';
}

function confidenceLabel(value?: number): string {
  if (value == null) return '暂无置信度';
  if (value >= 0.85) return '高置信';
  if (value >= 0.7) return '中高置信';
  return '中等置信';
}

function signalLabel(signal?: string): string {
  if (signal === 'saf_cost_advantaged') return 'SAF 成本占优';
  if (signal === 'switch_window_opening') return '切换窗口正在打开';
  if (signal === 'fossil_still_advantaged') return '化石航油仍占优';
  return '情景基线';
}

function signalTone(signal?: string): string {
  if (signal === 'saf_cost_advantaged') return 'border-success bg-success-soft text-success';
  if (signal === 'switch_window_opening') return 'border-warning bg-warning-soft text-warning';
  if (signal === 'fossil_still_advantaged') return 'border-accent bg-accent-soft text-accent';
  return 'border-danger bg-danger-soft text-danger';
}

function formatAsOf(value?: string): string {
  if (!value) return '暂不可用';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('zh-CN', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default async function CrisisPage() {
  const [dashboardReadModel, reserve, events, researchSignals] = await Promise.all([
    getDashboardReadModel(),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 }),
    getResearchSignals()
  ]);

  const tippingPoint = toTippingPointReadModel(dashboardReadModel.tippingPoint);
  const decision = toDecisionReadModel(dashboardReadModel.airlineDecision);

  const fallbackFossil = dashboardReadModel.market.values.jet_eu_proxy_usd_per_l ?? dashboardReadModel.market.values.jet_usd_per_l ?? 0.657;
  const researchBrief = buildResearchDecisionBrief(researchSignals);
  const reserveWeeks = reserve?.coverage_weeks ?? dashboardReadModel.reserve?.coverage_weeks ?? null;
  const reserveStatus = reserve ? '储备数据已连接' : '正在使用情景基线';
  const sourceType = reserve?.source_type ?? '情景基线';
  const confidence = reserve ? `${Math.round(reserve.confidence_score * 100)}%` : '暂不可用';
  const marketConfidence = dashboardReadModel.market.source_status.confidence;
  const marketConfidenceText = typeof marketConfidence === 'number'
    ? `${Math.round(marketConfidence * 100)}%`
    : '暂不可用';
  const carbonPriceEurPerT = Number(((dashboardReadModel.market.values.carbon_proxy_usd_per_t ?? 102.6) / 1.08).toFixed(2));
  const safWorkbenchHref = buildSafWorkbenchHref({
    fallbackFossil,
    carbonPriceEurPerT,
    reserveWeeks
  });
  const reviewSourcesHref = REVIEW_SOURCES_ROUTE;
  const crisisLinks = buildCrisisLinks(safWorkbenchHref, reviewSourcesHref);

  return (
    <Shell
      eyebrow="危机简报"
      title="EU 航油风险简报"
      description="先看储备压力和数据可信度，再进入储备详情或 SAF 工作台做深入判断。"
    >
      <div className="space-y-6">
        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-subtle">当前读数</p>
                <h3 className="mt-2 text-2xl font-semibold text-ink">
                  {reserveWeeks ? `EU 航油覆盖约 ${reserveWeeks.toFixed(2)} 周` : '储备覆盖需要重新连接'}
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                  {reserve
                    ? '储备压力数据已返回。页面按来源类型和置信度标注可信层级，避免把人工估算当作官方实时报价。'
                    : '本次会话未连上储备服务，页面会保留分析流程，并明确标注哪些读数来自情景基线。'}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${stressTone(reserve?.stress_level)}`}>
                {stressLabel(reserve?.stress_level)}
              </span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-accent bg-accent-soft p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-accent">数据时间</p>
                <p className="mt-2 text-sm font-semibold text-ink">{formatAsOf(reserve?.generated_at)}</p>
                <p className="mt-1 text-xs text-accent">来自后端最新储备信号</p>
              </div>
              <div className={`rounded-xl border p-4 ${sourceTone(sourceType)}`}>
                <p className="text-xs uppercase tracking-[0.15em] opacity-75">来源类型</p>
                <p className="mt-2 text-sm font-semibold">{sourceTypeLabel(sourceType)}</p>
                <p className="mt-1 text-xs opacity-80">{reserve?.source_name ?? '未连接实时储备源'}</p>
              </div>
              <div className={`rounded-xl border p-4 ${confidenceTone(reserve?.confidence_score)}`}>
                <p className="text-xs uppercase tracking-[0.15em] opacity-75">置信度</p>
                <p className="mt-2 text-sm font-semibold">{confidence}</p>
                <p className="mt-1 text-xs opacity-80">{confidenceLabel(reserve?.confidence_score)}</p>
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border p-6 shadow-sm ${signalTone(tippingPoint?.signal)}`}>
            <p className="text-xs uppercase tracking-[0.18em] opacity-75">决策信号</p>
            <h3 className="mt-2 text-xl font-semibold">{signalLabel(tippingPoint?.signal)}</h3>
            <p className="mt-3 text-sm leading-6 opacity-85">
              {reserveStatus}。化石航油基线为 ${fallbackFossil.toFixed(2)}/L，SAF 路径敏感性在下方继续展开。
            </p>
            <p className="mt-4 rounded-xl border border-surface/70 bg-surface/70 p-3 text-sm">
              市场数据置信度：{marketConfidenceText}。建议路径：先确认储备可信度，再测试 SAF 经济性。
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {crisisLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`rounded-2xl border p-5 shadow-sm transition ${item.tone}`}
            >
              <p className="text-xs uppercase tracking-[0.16em] text-muted">{item.eyebrow}</p>
              <h3 className="mt-2 text-xl font-semibold text-ink">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{item.description}</p>
            </a>
          ))}
        </section>

        <ReservesCoverageStrip reserve={reserve} />

        <TippingEventTimeline events={events} />

        <ResearchDecisionBriefCard brief={researchBrief} compact />

        <FuelVsSafPriceChart
          fossilJetUsdPerL={tippingPoint?.inputs.fossilJetUsdPerL ?? fallbackFossil}
          effectiveFossilJetUsdPerL={tippingPoint?.effectiveFossilJetUsdPerL ?? fallbackFossil}
          pathways={tippingPoint?.pathways ?? []}
        />

        <TippingPointSimulator
          tippingPoint={tippingPoint}
          decision={decision}
          reserveWeeks={reserveWeeks ?? 3}
        />
      </div>
    </Shell>
  );
}
