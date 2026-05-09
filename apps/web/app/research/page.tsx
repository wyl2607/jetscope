import { Shell } from '@/components/shell';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { AI_RESEARCH_ENABLED, buildResearchDecisionBrief, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '研究信号',
  description: 'AI 辅助的 SAF 与航油信号流，附带置信度与来源上下文。',
  path: '/research'
});

function toneForImpact(impact: string): string {
  if (impact === 'positive') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (impact === 'negative') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  if (impact === 'neutral') return 'border-slate-500/40 bg-slate-500/10 text-slate-200';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });
}

export default async function ResearchPage() {
  const result = await getResearchSignals();
  const brief = buildResearchDecisionBrief(result);

  return (
    <Shell
      eyebrow="AI 研究流水线"
      title="研究信号"
      description="从新闻中提取 ESG 与市场信号。Phase B 启用前本页保持安全可构建；研究 API 上线后切换为数据支撑。"
    >
      {!AI_RESEARCH_ENABLED ? (
        <section className="rounded-2xl border border-dashed border-sky-600/50 bg-sky-500/10 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-200">流水线未启用</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200">
            Phase B 后端部署后设置 <code>JETSCOPE_AI_RESEARCH_ENABLED=true</code>。在此之前，
            该路由仅展示产品界面，不声称正在运行实时 Claude 分析。
          </p>
        </section>
      ) : null}

      {result.status === 'error' ? (
        <section className="mt-6 rounded-2xl border border-rose-600/40 bg-rose-500/10 p-6 text-sm text-rose-100">
          Research API 错误：{result.message}
        </section>
      ) : null}

      <section className="mt-6">
        <ResearchDecisionBriefCard brief={brief} />
      </section>

      {result.status !== 'error' && result.signals.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-xl font-semibold text-white">暂无研究信号</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            每日研究任务尚未持久化信号前，这是预期状态。该路由保持可构建，并已准备接入 Phase B 信号流。
          </p>
        </section>
      ) : result.status === 'error' ? null : (
        <section className="mt-6 grid gap-4">
          {result.signals.map((signal) => (
            <article key={signal.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${toneForImpact(signal.impact_direction)}`}>
                  {signal.impact_direction}
                </span>
                <span className="text-xs uppercase tracking-[0.14em] text-slate-400">{signal.signal_type}</span>
                <span className="text-xs text-slate-500">{formatTime(signal.published_at)}</span>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-white">{signal.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">{signal.summary_en}</p>
              <p className="mt-3 text-sm leading-7 text-slate-400">{signal.summary_cn}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.14em] text-slate-500">
                置信度 {(signal.confidence * 100).toFixed(0)}%
              </p>
            </article>
          ))}
        </section>
      )}
    </Shell>
  );
}
