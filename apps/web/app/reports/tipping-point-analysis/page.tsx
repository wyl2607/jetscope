import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';
import { Shell } from '@/components/shell';
import { TippingEventTimeline } from '@/components/tipping-event-timeline';
import {
  getDashboardReadModel,
  toDecisionReadModel,
  toTippingPointReadModel
} from '@/lib/product-read-model';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { buildResearchDecisionBrief, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '临界点报告',
  description: '以数据支撑的 JetScope 报告页，解释欧洲航油压力与 SAF 切换经济性。',
  path: '/reports/tipping-point-analysis'
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default async function TippingPointReportPage() {
  const [dashboardReadModel, reserve, events, researchSignals] = await Promise.all([
    getDashboardReadModel(),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 20 }),
    getResearchSignals()
  ]);

  const tippingPoint = toTippingPointReadModel(dashboardReadModel.tippingPoint);
  const decision = toDecisionReadModel(dashboardReadModel.airlineDecision);
  const fossilJetUsdPerL =
    tippingPoint?.inputs.fossilJetUsdPerL ??
    dashboardReadModel.market.values.jet_eu_proxy_usd_per_l ??
    dashboardReadModel.market.values.jet_usd_per_l ??
    0.99;
  const effectiveFossilJetUsdPerL = tippingPoint?.effectiveFossilJetUsdPerL ?? fossilJetUsdPerL;
  const switchProbability = Math.round(
    Math.max(
      decision?.probabilities?.buy_spot_saf ?? 0,
      decision?.probabilities?.sign_long_term_offtake ?? 0
    ) * 100
  );
  const researchBrief = buildResearchDecisionBrief(researchSignals);

  return (
    <Shell
      eyebrow="报告页"
      title="临界点报告"
      description="将驾驶舱数据转化为可阅读的投资与运营论点。"
    >
      <article className="space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-300">核心论点</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">
            当储备压力、传统航油价格与政策惩罚同时收敛时，SAF 采购会变得理性。
          </h3>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">
            JetScope 将欧洲航空燃料危机视为决策阈值，而不是静态合规叙事。
            当前报告页使用实时驾驶舱契约，并清晰标注代理或人工来源；
            AI 研究信号用于解释运营论点为何正在变化。
          </p>
        </section>

        <ReservesCoverageStrip reserve={reserve} />

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400">当前信号</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {tippingPoint?.signal ?? dashboardReadModel.freshnessSignal.level}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400">切换概率</p>
            <p className="mt-3 text-2xl font-semibold text-emerald-300">{switchProbability}%</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400">已加载事件</p>
            <p className="mt-3 text-2xl font-semibold text-amber-300">{events.length}</p>
          </div>
        </section>

        <FuelVsSafPriceChart
          fossilJetUsdPerL={fossilJetUsdPerL}
          effectiveFossilJetUsdPerL={effectiveFossilJetUsdPerL}
          pathways={tippingPoint?.pathways ?? []}
        />

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-300">航司决策含义</p>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            决策模型刻意以概率与阈值证据呈现，而不是给出简单的是/否建议。
            储备事件显示运营环境何时跨过警戒或严重区间；研究信号解释概率叙事为何发生变化。
          </p>
        </section>

        <ResearchDecisionBriefCard brief={researchBrief} />

        <TippingEventTimeline events={events} />
      </article>
    </Shell>
  );
}
