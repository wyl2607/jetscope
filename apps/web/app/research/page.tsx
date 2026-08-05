import { InfoCard, MetricCard } from '@/components/cards';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { Shell } from '@/components/shell';
import { AI_RESEARCH_ENABLED, buildResearchDecisionBrief, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '研究工作台',
  description: 'AI 辅助的 SAF 与航油研究信号工作台，附带启用状态、置信度与复核动作。',
  path: '/research'
});

const actionLinks: Array<{ label: string; href: Route; description: string }> = [
  {
    label: '打开临界点报告',
    href: '/reports/tipping-point-analysis' as Route,
    description: '把研究信号放回储备、航油价格和 SAF 切换概率的报告语境。'
  },
  {
    label: '复核来源',
    href: '/sources?filter=review' as Route,
    description: '先确认市场来源、代理和回退状态，再使用研究信号解释变化。'
  }
];

function toneForImpact(impact: string): string {
  if (impact === 'positive') return 'border-success bg-success-soft text-success';
  if (impact === 'negative') return 'border-danger bg-danger-soft text-danger';
  if (impact === 'neutral') return 'border-line bg-surface text-muted';
  return 'border-warning bg-warning-soft text-warning';
}

function impactLabel(impact: string): string {
  if (impact === 'positive') return '正向';
  if (impact === 'negative') return '负向';
  if (impact === 'neutral') return '中性';
  return '未知';
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  });
}

export default async function ResearchPage() {
  const result = await getResearchSignals();
  const brief = buildResearchDecisionBrief(result);
  const latestSignal = result.signals[0] ?? null;
  const pipelineStatus = AI_RESEARCH_ENABLED
    ? result.status === 'error'
      ? '错误'
      : result.signals.length
        ? '运行中'
        : '等待信号'
    : '未启用';
  const pipelineHint = AI_RESEARCH_ENABLED
    ? '研究 API 已启用；页面展示最近 30 天内持久化的信号。'
    : '开启研究流水线前，本页只展示产品工作台，不声称正在运行实时 AI 分析。';

  return (
    <Shell
      eyebrow="AI 研究流水线"
      title="研究工作台"
      description="把文章级信号变成可复核的决策解释层；未启用时保持诚实空态。"
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="流水线状态" value={pipelineStatus} hint={pipelineHint} />
        <MetricCard label="信号总数" value={`${result.signals.length}`} hint={`正向 ${brief.positiveCount} · 负向 ${brief.negativeCount} · 中性 ${brief.neutralCount}`} />
        <MetricCard
          label="最新信号"
          value={latestSignal ? formatTime(latestSignal.published_at) : '暂无'}
          hint={latestSignal ? latestSignal.title : '还没有可用于报告叙事的研究记录'}
        />
        <MetricCard
          label="使用边界"
          value={AI_RESEARCH_ENABLED ? '可解释' : '只读空态'}
          hint="研究信号只解释变化原因，不替代市场、储备或来源复核。"
        />
      </section>

      {!AI_RESEARCH_ENABLED ? (
        <section className="mt-8 rounded-2xl border border-dashed border-accent bg-accent-soft p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">开启研究流水线</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
            后端研究任务部署后设置 <code>JETSCOPE_AI_RESEARCH_ENABLED=true</code>。在此之前，
            页面保持可构建、可导航、可解释边界，但不会冒充实时 Claude 分析结果。
          </p>
        </section>
      ) : null}

      {result.status === 'error' ? (
        <section className="mt-8 rounded-2xl border border-danger bg-danger-soft p-6 text-sm text-danger">
          Research API 错误：{result.message}
        </section>
      ) : null}

      <section className="mt-8">
        <ResearchDecisionBriefCard brief={brief} showLink={false} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <InfoCard title="信号列表" subtitle="按当前 read model 返回结果展示">
          {result.status !== 'error' && result.signals.length === 0 ? (
            <p className="text-sm leading-7 text-muted">
              暂无研究信号。每日研究任务尚未持久化信号前，这是预期状态；报告仍应以市场、储备和来源状态为主。
            </p>
          ) : result.status === 'error' ? (
            <p className="text-sm leading-7 text-muted">错误恢复前不展示信号列表，避免把不完整数据写进报告判断。</p>
          ) : (
            <div className="space-y-4">
              {result.signals.map((signal) => (
                <article key={signal.id} className="rounded-lg border border-line bg-surface-muted p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${toneForImpact(signal.impact_direction)}`}>
                      {impactLabel(signal.impact_direction)}
                    </span>
                    <span className="text-xs uppercase tracking-[0.14em] text-muted">{signal.signal_type}</span>
                    <span className="text-xs text-muted">{formatTime(signal.published_at)}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-ink">{signal.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted">{signal.summary_cn}</p>
                  <p className="mt-3 text-sm leading-7 text-muted">{signal.summary_en}</p>
                  <p className="mt-4 text-xs uppercase tracking-[0.14em] text-muted">
                    置信度 {(signal.confidence * 100).toFixed(0)}%
                  </p>
                </article>
              ))}
            </div>
          )}
        </InfoCard>

        <InfoCard title="使用动作" subtitle="研究信号必须回到证据链">
          <div className="space-y-3">
            {actionLinks.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="block rounded-lg border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
              >
                <p className="font-semibold text-ink">{action.label}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
              </Link>
            ))}
          </div>
        </InfoCard>
      </section>
    </Shell>
  );
}
