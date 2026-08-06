import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { TransitionLadder } from '@/components/transition-ladder';
import { type TransitionSummaryResponse, loadTransitionSummary } from '@/lib/transition-read-model';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { AI_RESEARCH_ENABLED, buildResearchDecisionBrief, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope 航油转型决策入口',
  description: '用五分钟了解欧洲航油压力信号、SAF 转折点事件、EU ETS 成本影响与 AI 辅助研究工作流。',
  path: '/'
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const valid = values.filter(
    (value): value is string => typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
  );
  return valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function stressTone(stressLevel?: string): string {
  if (stressLevel === 'critical') return 'text-danger';
  if (stressLevel === 'elevated') return 'text-warning';
  if (stressLevel === 'normal') return 'text-success';
  return 'text-warning';
}

function eventTone(eventType?: string): string {
  if (eventType === 'CRITICAL') return 'text-danger';
  if (eventType === 'ALERT') return 'text-warning';
  if (eventType === 'CROSSOVER') return 'text-success';
  return 'text-warning';
}

function researchTone(status: string): string {
  if (status === 'error') return 'text-danger';
  if (status === 'not_found') return 'text-warning';
  return 'text-accent';
}

function reserveBasis(sourceType?: string): SourceRef['basis'] {
  if (sourceType === 'official') return 'observed';
  if (sourceType === 'derived') return 'derived';
  return 'assumption';
}

const CTA_CARDS: Array<{ title: string; description: string; href: Route }> = [
  { title: '危机监测', description: '面向运营团队的实时库存覆盖、压力色带与转折事件时间线。', href: '/crisis' as Route },
  { title: '研究信号台', description: 'AI 信号流、双语摘要与置信度过滤，帮助快速筛选可行动线索。', href: '/research' as Route },
  { title: '路径推演', description: '比较 SAF 路径与成本情景，判断何时 SAF 成为经营理性选择。', href: '/crisis/saf-tipping-point' as Route },
  { title: '电网平价', description: '比较可再生 LCOE 与化石发电加 EU ETS 碳成本的交叉点。', href: '/grid' as Route },
  { title: '分析报告', description: '为招聘方、评审者和业务读者准备的结构化投资与产品论证。', href: '/reports/tipping-point-analysis' as Route }
];

export default async function HomePage() {
  const [reserve, events, signalsResult] = await Promise.all([
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 }),
    getResearchSignals()
  ]);
  const latestEvent = events[0] ?? null;
  const latestResearchSignal = signalsResult.signals.reduce<typeof signalsResult.signals[number] | null>((latest, signal) => {
    if (!latest) return signal;
    return Date.parse(signal.published_at) > Date.parse(latest.published_at) ? signal : latest;
  }, null);
  const signalCount = signalsResult.signals.length;
  const researchBrief = buildResearchDecisionBrief(signalsResult);
  const asOf = latestTimestamp([reserve?.generated_at, latestEvent?.observed_at, latestResearchSignal?.published_at]);

  let transition: TransitionSummaryResponse | null = null;
  let transitionError = false;
  try {
    transition = await loadTransitionSummary();
  } catch {
    transitionError = true;
  }

  return (
    <PageTemplate
      eyebrow="Phase C 作品集入口"
      title="JetScope"
      question="这个产品能不能回答我关心的问题，我该从哪一页开始？"
      asOf={asOf}
    >
      <SignalRow label="产品入口与当前信号">
        <MetricCard
          label="推荐起点"
          value="决策驾驶舱"
          hint="先看全局结论，再按问题进入详情页。"
          cardHref="/dashboard"
        />
        <MetricCard
          label="库存覆盖"
          value={reserve ? `${reserve.coverage_weeks.toFixed(2)} 周` : '暂不可用'}
          valueClassName={stressTone(reserve?.stress_level)}
          hint={reserve ? `压力等级：${reserve.stress_level} · /v1/reserves/eu` : '上游储备数据暂不可用，必须复核。'}
        />
        <MetricCard
          label="最近转折事件"
          value={latestEvent ? latestEvent.event_type : '暂无事件'}
          valueClassName={eventTone(latestEvent?.event_type)}
          hint={latestEvent
            ? `${latestEvent.saf_pathway.toUpperCase()} · 已载入 ${events.length} 条 · /v1/analysis/tipping-point/events`
            : '事件流为空，不等于没有风险。'}
        />
        <MetricCard
          label="研究信号"
          value={signalsResult.status === 'not_found' ? '未部署' : signalsResult.status === 'error' ? '接口异常' : `${signalCount} 条`}
          valueClassName={researchTone(signalsResult.status)}
          hint="/v1/research/signals · 状态口径与研究页一致。"
        />
      </SignalRow>

      <Panel
        title="产品论点"
        why="先判断 JetScope 的问题空间是否与你的工作相关，再决定进入驾驶舱、情景或来源复核。"
      >
        <div className="space-y-4">
          <p className="text-2xl font-semibold leading-tight text-ink md:text-4xl">
            欧洲 Jet-A 航油库存已连续六周徘徊在三周覆盖线附近。SAF 要到什么价格，才会成为经营理性选择？
          </p>
          <p className="text-base leading-7 text-muted md:text-lg">
            JetScope 用实时市场数据与策略模型回答何时 SAF 不再只是合规成本，而是经营理性选择。
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/dashboard" className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-surface transition hover:bg-ink">打开决策驾驶舱</Link>
            <Link href="/scenarios" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent-soft">测试情景</Link>
            <Link href="/sources" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent-soft">查看来源质量</Link>
          </div>
        </div>
      </Panel>

      <Panel title="双域叙事" why="同一碳价如何连接航空与电力，决定读者应进入哪一个问题域继续分析。">
        <div className="space-y-4">
          <p className="text-base leading-7 text-ink">同一 EU ETS 碳价正在同时推动天上的 SAF 转折点与地上的电网平价：它把化石燃料的排放成本显性化，也让低碳替代方案更快跨过经营理性线。</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/grid" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent-soft">查看电网平价</Link>
            <Link href="/crisis/saf-tipping-point" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent-soft">查看 SAF 转折点</Link>
          </div>
        </div>
      </Panel>

      <Panel
        title="脱碳碳价阶梯"
        why="把不同技术放在同一碳价轴上，帮助读者选择值得继续查看的转型路径。"
        state={transitionError ? 'error' : transition ? 'ready' : 'empty'}
        stateDetail={transitionError
          ? '转型摘要接口暂不可用；本页保留错误态，避免这块内容静默消失。'
          : '接口已响应，但没有可展示的转型摘要。'}
      >
        {transition ? <TransitionLadder summary={transition} /> : null}
      </Panel>

      <Panel title="研究决策层" why="研究信号解释上面的市场数字在往哪个方向动，以及哪些说法仍需复核。">
        <ResearchDecisionBriefCard brief={researchBrief} compact />
      </Panel>

      <Panel title="选择下一页" why="这些入口按任务分工，而不是用装饰性色彩暗示不存在的状态。">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
          {CTA_CARDS.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="rounded-xl border border-line bg-surface p-5 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted">深入查看</p>
              <h3 className="mt-2 text-xl font-semibold text-ink">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{card.description}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <SourceFooter
        sources={[
          {
            id: 'reserve-signal',
            label: `欧盟储备覆盖 API（${reserve?.source_name ?? '当前不可用'}）`,
            href: '/sources',
            asOf: reserve?.generated_at ?? null,
            basis: reserveBasis(reserve?.source_type)
          },
          {
            id: 'tipping-events',
            label: `SAF 临界点事件流（${events.length} 条）`,
            href: '/crisis/saf-tipping-point',
            asOf: latestEvent?.observed_at ?? null,
            basis: 'observed'
          },
          {
            id: 'research-signals',
            label: `研究信号流（${signalCount} 条）`,
            href: '/research',
            asOf: latestResearchSignal?.published_at ?? null,
            basis: 'derived'
          }
        ]}
        methodHref="/sources"
        methodLabel="口径与来源清单"
        limitations={[
          '首页是摘要与导航入口，不呈现每个数字的完整计算口径；请进入对应详情页复核。',
          '空事件窗口不代表没有风险，研究接口未部署或异常也不代表没有市场变化。',
          AI_RESEARCH_ENABLED ? '研究信号是文章与流水线派生证据，不替代市场观测。' : '当前环境未启用 AI 研究流水线，首页明确展示这一边界。'
        ]}
      />
    </PageTemplate>
  );
}
