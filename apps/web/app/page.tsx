import { Shell } from '@/components/shell';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import {
  AI_RESEARCH_ENABLED,
  buildResearchDecisionBrief,
  getResearchSignals
} from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope 航油转型决策入口',
  description:
    '用五分钟了解欧洲航油压力信号、SAF 转折点事件、EU ETS 成本影响与 AI 辅助研究工作流。',
  path: '/'
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function stressTone(stressLevel?: string): string {
  if (stressLevel === 'critical') return 'text-rose-300';
  if (stressLevel === 'elevated') return 'text-amber-300';
  if (stressLevel === 'normal') return 'text-emerald-300';
  return 'text-yellow-300';
}

function eventTone(eventType?: string): string {
  if (eventType === 'CRITICAL') return 'text-rose-300';
  if (eventType === 'ALERT') return 'text-amber-300';
  if (eventType === 'CROSSOVER') return 'text-emerald-300';
  return 'text-slate-300';
}

const CTA_CARDS = [
  {
    title: '危机监测',
    description: '面向运营团队的实时库存覆盖、压力色带与转折事件时间线。',
    href: '/crisis' as Route,
    tone: 'border-rose-600/40 bg-rose-500/10'
  },
  {
    title: '研究信号台',
    description: 'AI 信号流、双语摘要与置信度过滤，帮助快速筛选可行动线索。',
    href: '/research' as Route,
    tone: 'border-sky-600/40 bg-sky-500/10'
  },
  {
    title: '路径推演',
    description: '比较 SAF 路径与成本情景，判断何时 SAF 成为经营理性选择。',
    href: '/crisis/saf-tipping-point' as Route,
    tone: 'border-emerald-600/40 bg-emerald-500/10'
  },
  {
    title: '分析报告',
    description: '为招聘方、评审者和业务读者准备的结构化投资与产品论证。',
    href: '/reports/tipping-point-analysis' as Route,
    tone: 'border-indigo-600/40 bg-indigo-500/10'
  }
];

export default async function HomePage() {
  const [reserve, events, signalsResult] = await Promise.all([
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 }),
    getResearchSignals()
  ]);

  const latestEvent = events[0] ?? null;
  const signalCount = signalsResult.signals.length;
  const researchBrief = buildResearchDecisionBrief(signalsResult);

  return (
    <Shell
      eyebrow="Phase C 作品集入口"
      title="JetScope"
      description="面向招聘团队、航空运营方和能源转型研究者的五分钟产品价值入口。"
    >
      <section className="rounded-2xl border border-slate-700 bg-slate-950/80 p-8">
        <p className="text-2xl font-semibold leading-tight text-white md:text-4xl">
          欧洲 Jet-A 航油库存已连续六周徘徊在三周覆盖线附近。SAF 要到什么价格，才会成为经营理性选择？
        </p>
        <p className="mt-4 text-base leading-7 text-slate-300 md:text-lg">
          欧洲航油库存连续六周维持在三周覆盖线附近，JetScope 用实时市场数据与策略模型回答同一个问题：
          何时 SAF 不再只是合规成本，而是经营理性选择。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold !text-slate-950 transition hover:bg-sky-300"
          >
            打开决策驾驶舱
          </Link>
          <Link
            href="/scenarios"
            className="rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold !text-slate-100 transition hover:border-sky-400 hover:!text-sky-200"
          >
            测试情景
          </Link>
          <Link
            href="/sources"
            className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold !text-slate-300 transition hover:border-slate-500 hover:!text-white"
          >
            查看来源质量
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">核心指标 1 · 库存覆盖</p>
          <h3 className="mt-2 text-lg font-semibold text-white">/v1/reserves/eu</h3>
          <p className={`mt-4 text-3xl font-semibold ${stressTone(reserve?.stress_level)}`}>
            {reserve ? `${reserve.coverage_weeks.toFixed(2)} 周` : '暂不可用'}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {reserve ? `压力等级：${reserve.stress_level} · 来源：${reserve.source_type}` : '上游暂时降级时，页面保留可读的兜底状态。'}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">核心指标 2 · 转折事件</p>
          <h3 className="mt-2 text-lg font-semibold text-white">/v1/analysis/tipping-point/events</h3>
          <p className={`mt-4 text-3xl font-semibold ${eventTone(latestEvent?.event_type)}`}>
            {latestEvent ? latestEvent.event_type : '暂无事件'}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {latestEvent
              ? `${latestEvent.saf_pathway.toUpperCase()} 价差 ${latestEvent.gap_usd_per_l.toFixed(3)} USD/L · 已载入 ${events.length} 个事件`
              : '事件流启动前，时间线以占位状态保持可读。'}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">核心指标 3 · 研究信号</p>
          <h3 className="mt-2 text-lg font-semibold text-white">/v1/research/signals</h3>
          <p className="mt-4 text-3xl font-semibold text-sky-300">
            {signalsResult.status === 'not_found'
              ? '404 兜底'
              : signalsResult.status === 'error'
                ? '接口异常'
                : `${signalCount} 条信号`}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {signalsResult.status === 'not_found'
              ? 'Phase B API 尚未合入时，页面显示部署提示而不是崩溃。'
              : signalsResult.status === 'error'
                ? `Research API 暂时降级：${signalsResult.message}`
              : AI_RESEARCH_ENABLED
                ? '信号按类型分组，并提供双语摘要与置信度阈值。'
                : 'AI_RESEARCH_ENABLED=false：研究页按设计展示空状态。'}
          </p>
        </article>
      </section>

      <section className="mt-8">
        <ResearchDecisionBriefCard brief={researchBrief} compact />
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {CTA_CARDS.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className={`rounded-2xl border p-5 transition hover:border-slate-500 ${card.tone}`}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-slate-300">深入查看</p>
            <h3 className="mt-2 text-xl font-semibold text-white">{card.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-200">{card.description}</p>
          </Link>
        ))}
      </section>
    </Shell>
  );
}
