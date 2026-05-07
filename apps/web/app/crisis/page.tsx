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

const CRISIS_LINKS: Array<{ title: string; description: string; href: Route }> = [
  {
    title: '打开储备详情',
    description: '先检查覆盖周数、来源类型、置信度和供应缺口，再调整采购判断。',
    href: '/crisis/eu-jet-reserves' as Route
  },
  {
    title: '打开 SAF 工作台',
    description: '测试燃油、碳价、掺混比例、储备压力与 SAF 路径敏感性。',
    href: '/crisis/saf-tipping-point' as Route
  }
];

function stressLabel(level?: string): string {
  if (level === 'critical') return '紧急';
  if (level === 'elevated') return '偏高';
  if (level === 'guarded') return '警戒';
  if (level === 'normal') return '平稳';
  return '回退模式';
}

function stressTone(level?: string): string {
  if (level === 'critical') return 'border-rose-300 bg-rose-50 text-rose-700';
  if (level === 'elevated') return 'border-amber-300 bg-amber-50 text-amber-800';
  if (level === 'normal') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  return 'border-sky-200 bg-sky-50 text-sky-800';
}

function signalLabel(signal?: string): string {
  if (signal === 'saf_cost_advantaged') return 'SAF 成本占优';
  if (signal === 'switch_window_opening') return '切换窗口正在打开';
  if (signal === 'fossil_still_advantaged') return '化石航油仍占优';
  return '情景基线';
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

  const fallbackFossil = dashboardReadModel.market.values.jet_eu_proxy_usd_per_l ?? dashboardReadModel.market.values.jet_usd_per_l ?? 0.99;
  const researchBrief = buildResearchDecisionBrief(researchSignals);
  const reserveWeeks = reserve?.coverage_weeks ?? dashboardReadModel.reserve?.coverage_weeks ?? null;
  const reserveStatus = reserve ? '储备数据已连接' : '正在使用情景基线';
  const sourceType = reserve?.source_type ?? '情景基线';
  const confidence = reserve ? `${Math.round(reserve.confidence_score * 100)}%` : '暂不可用';

  return (
    <Shell
      eyebrow="危机简报"
      title="EU 航油风险简报"
      description="先看储备压力和数据可信度，再进入储备详情或 SAF 工作台做深入判断。"
    >
      <div className="space-y-6">
        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">当前读数</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {reserveWeeks ? `EU 航油覆盖约 ${reserveWeeks.toFixed(2)} 周` : '储备覆盖需要重新连接'}
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  {reserve
                    ? '储备压力数据已返回。进入详情页可核对来源、置信度和供应缺口，再决定是否调整采购假设。'
                    : '本次会话未连上储备服务，页面会保留分析流程，并明确标注哪些读数来自情景基线。'}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${stressTone(reserve?.stress_level)}`}>
                {stressLabel(reserve?.stress_level)}
              </span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-400">截至时间</p>
                <p className="mt-2 text-sm font-semibold text-white">{formatAsOf(reserve?.generated_at)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-400">来源类型</p>
                <p className="mt-2 text-sm font-semibold text-white">{sourceType}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-400">置信度</p>
                <p className="mt-2 text-sm font-semibold text-white">{confidence}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">决策信号</p>
            <h3 className="mt-2 text-xl font-semibold text-white">{signalLabel(tippingPoint?.signal)}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {reserveStatus}。化石航油基线为 ${fallbackFossil.toFixed(2)}/L，SAF 路径敏感性在下方继续展开。
            </p>
            <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
              建议路径：先确认储备可信度，再测试 SAF 经济性。
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {CRISIS_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-sky-500/60 hover:bg-sky-950/30"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-sky-300">从这里开始</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{item.description}</p>
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
