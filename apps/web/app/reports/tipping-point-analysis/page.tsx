import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { Panel } from '@/components/panel';
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
  path: '/reports/tipping-point-analysis',
  alternateLanguages: {
    'zh-CN': '/reports/tipping-point-analysis',
    de: '/de/reports/tipping-point-analysis',
    en: '/en/reports/tipping-point-analysis'
  }
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
    0.657;
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
        <section className="rounded-2xl border border-line bg-surface p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-accent">核心论点</p>
          <h3 className="mt-3 text-2xl font-semibold text-ink">
            当储备压力、传统航油价格与政策惩罚同时收敛时，SAF 采购会变得理性。
          </h3>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-muted">
            JetScope 将欧洲航空燃料危机视为决策阈值，而不是静态合规叙事。
            当前报告页使用实时驾驶舱契约，并清晰标注代理或人工来源；
            AI 研究信号用于解释运营论点为何正在变化。
          </p>
        </section>

        <Panel
          title="欧盟航煤储备覆盖"
          why="储备周数决定这份报告的紧迫度：覆盖越薄，价格与政策的反应窗口越短。"
        >
          <ReservesCoverageStrip reserve={reserve} />
        </Panel>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-muted">当前信号</p>
            <p className="mt-3 text-2xl font-semibold text-ink">
              {tippingPoint?.signal ?? dashboardReadModel.freshnessSignal.level}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-muted">切换概率</p>
            <p className="mt-3 text-2xl font-semibold text-success">{switchProbability}%</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-muted">已加载事件</p>
            <p className="mt-3 text-2xl font-semibold text-warning">{events.length}</p>
          </div>
        </section>

        <Panel
          title="航油与 SAF 价格阶梯"
          why="化石航油基准、碳调整后的有效成本，以及各路径的净成本区间——报告的经济学论点全部落在这张图的差距上。"
        >
          <FuelVsSafPriceChart
            fossilJetUsdPerL={fossilJetUsdPerL}
            effectiveFossilJetUsdPerL={effectiveFossilJetUsdPerL}
            pathways={tippingPoint?.pathways ?? []}
          />
        </Panel>

        <section className="rounded-2xl border border-line bg-surface p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-accent">航司决策含义</p>
          <p className="mt-3 text-sm leading-7 text-muted">
            决策模型刻意以概率与阈值证据呈现，而不是给出简单的是/否建议。
            储备事件显示运营环境何时跨过警戒或严重区间；研究信号解释概率叙事为何发生变化。
          </p>
        </section>

        <Panel
          title="研究决策层"
          why="解释这份报告的论点为什么在变。信号本身不是结论，是结论的理由。"
        >
          <ResearchDecisionBriefCard brief={researchBrief} />
        </Panel>

        <Panel
          title="SAF 交叉时间线"
          why="记录 SAF 有效成本真的越过化石航油的时刻，而不是模型预测它会越过。"
        >
          <TippingEventTimeline events={events} />
        </Panel>
      </article>
    </Shell>
  );
}
