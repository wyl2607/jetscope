import { MetricCard } from '@/components/cards';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';
import { SourceFooter } from '@/components/source-footer';
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

function tippingSignalTone(signal?: string): string {
  if (signal === 'saf_cost_advantaged') return 'text-success';
  if (signal === 'switch_window_opening') return 'text-warning';
  if (signal === 'fossil_still_advantaged') return 'text-danger';
  return 'text-warning';
}

function probabilityTone(probability: number): string {
  if (probability >= 67) return 'text-success';
  if (probability >= 34) return 'text-warning';
  return 'text-danger';
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
  const fossilJetSource =
    tippingPoint?.inputs.fossilJetUsdPerL != null
      ? 'model'
      : dashboardReadModel.market.values.jet_eu_proxy_usd_per_l != null
        ? 'proxy'
        : dashboardReadModel.market.values.jet_usd_per_l != null
          ? 'spot'
          : 'assumed';
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
  const asOf = dashboardReadModel.isFallback ? null : dashboardReadModel.market.generated_at;

  return (
    <PageTemplate
      eyebrow="报告页"
      title="临界点报告"
      question="这份报告的经济学论点，现在还站得住吗？"
      asOf={asOf}
    >
      <SignalRow label="临界点结论">
        <MetricCard
          label="当前临界点信号"
          value={tippingPoint?.signal ?? '未识别'}
          valueClassName={tippingSignalTone(tippingPoint?.signal)}
          hint="结论优先；未知信号保留为需复核状态。"
        />
        <MetricCard
          label="SAF 切换概率"
          value={`${switchProbability}%`}
          valueClassName={probabilityTone(switchProbability)}
          hint="取现货采购与长期承购两项概率中的较高值。"
        />
        <MetricCard
          label="已加载事件"
          value={`${events.length}`}
          valueClassName="text-ink"
          hint="当前 42 天复核窗口内的事件样本量。"
        />
      </SignalRow>

      <Panel
        title="核心论点"
        why="先说明这份报告要验证的因果链，避免读者把任一单项指标误当成完整结论。"
      >
        <div className="space-y-4 text-sm leading-7 text-muted">
          <p className="text-2xl font-semibold leading-tight text-ink">
            当储备压力、传统航油价格与政策惩罚同时收敛时，SAF 采购会变得理性。
          </p>
          <p>
            JetScope 将欧洲航空燃料危机视为决策阈值，而不是静态合规叙事。当前报告页使用实时驾驶舱契约，
            并清晰标注代理或人工来源；AI 研究信号用于解释运营论点为何正在变化。
          </p>
        </div>
      </Panel>

      <Panel
        title="欧盟航煤储备覆盖"
        why="储备周数决定这份报告的紧迫度：覆盖越薄，价格与政策的反应窗口越短。"
      >
        <ReservesCoverageStrip reserve={reserve} />
      </Panel>

      <Panel
        title="航油与 SAF 价格阶梯"
        why={
          fossilJetSource === 'assumed'
            ? '化石航油基准未取到实时值，使用内置假设 0.657 USD/L；因此价格差只能用于情景讨论。'
            : '化石航油基准、碳调整后的有效成本，以及各路径的净成本区间——报告的经济学论点全部落在这张图的差距上。'
        }
      >
        <FuelVsSafPriceChart
          fossilJetUsdPerL={fossilJetUsdPerL}
          effectiveFossilJetUsdPerL={effectiveFossilJetUsdPerL}
          pathways={tippingPoint?.pathways ?? []}
        />
      </Panel>

      <Panel
        title="航司决策含义"
        why="把模型输出翻译成可复核的运营含义，避免概率被误读为简单的是或否建议。"
      >
        <p className="text-sm leading-7 text-muted">
          决策模型刻意以概率与阈值证据呈现，而不是给出简单的是/否建议。储备事件显示运营环境何时跨过警戒或严重区间；
          研究信号解释概率叙事为何发生变化。
        </p>
      </Panel>

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

      <SourceFooter
        sources={[
          {
            id: 'reserve-signal',
            label: `欧盟航煤储备覆盖（${reserve?.source_name ?? '来源暂不可用'}）`,
            asOf: reserve?.generated_at ?? null,
            basis: reserve?.source_type === 'official' ? 'observed' : reserve?.source_type === 'derived' ? 'derived' : 'assumption'
          },
          {
            id: 'report-fossil-anchor',
            label: fossilJetSource === 'assumed' ? '内置化石航油基准 0.657 USD/L' : '驾驶舱化石航油价格基准',
            asOf,
            basis: dashboardReadModel.isFallback ? 'assumption' : fossilJetSource === 'spot' ? 'observed' : fossilJetSource === 'assumed' ? 'assumption' : 'derived'
          },
          {
            id: 'tipping-events',
            label: `SAF 临界点事件流（42 天窗口，${events.length} 条）`,
            asOf: events[0]?.observed_at ?? null,
            basis: 'observed'
          },
          {
            id: 'research-signals',
            label: `研究信号流（${researchSignals.signals.length} 条）`,
            asOf: researchSignals.signals[0]?.published_at ?? null,
            basis: 'derived'
          }
        ]}
        methodHref="/sources"
        methodLabel="口径与来源清单"
        limitations={[
          '报告展示跨市场的经济学阈值，不替代单一航司的合同、库存或采购审批。',
          '切换概率来自模型情景，不是对未来行为的观测；低样本事件窗口也不等于没有风险。',
          '化石航油实时值缺失时会明确使用 0.657 USD/L 内置假设，届时价格结论只能作为情景依据。'
        ]}
      />
    </PageTemplate>
  );
}
