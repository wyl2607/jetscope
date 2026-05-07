import type { ResearchDecisionBrief } from '@/lib/research-signals-read-model';
import type { Route } from 'next';
import Link from 'next/link';

const RESEARCH_ROUTE = '/research' as Route;

type Props = {
  brief: ResearchDecisionBrief;
  compact?: boolean;
};

function statusTone(status: ResearchDecisionBrief['status']): string {
  if (status === 'error') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (status === 'not_found') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'empty') return 'border-slate-200 bg-white text-slate-700';
  return 'border-sky-200 bg-sky-50 text-sky-800';
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function impactLabel(value: ResearchDecisionBrief['topSignals'][number]['impact_direction']): string {
  if (value === 'positive') return '正向';
  if (value === 'negative') return '负向';
  if (value === 'neutral') return '中性';
  return '未知';
}

export function ResearchDecisionBriefCard({ brief, compact = false }: Props) {
  return (
    <section className={`rounded-2xl border p-6 ${statusTone(brief.status)}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] opacity-75">研究决策层</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">{brief.headline}</h3>
        </div>
        <Link href={RESEARCH_ROUTE} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800">
          打开信号
        </Link>
      </div>

      <p className="mt-4 text-sm leading-7 text-slate-700">{brief.whyMatters}</p>
      <p className="mt-3 text-sm leading-7 text-slate-600">{brief.action}</p>

      {!compact ? (
        <div className="mt-5 grid gap-3 text-sm md:grid-cols-4">
          <p className="rounded-xl border border-sky-200 bg-sky-50 p-3">活跃：{brief.activeCount}</p>
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">利多：{brief.positiveCount}</p>
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3">利空：{brief.negativeCount}</p>
          <p className="rounded-xl border border-slate-200 bg-white p-3">中性：{brief.neutralCount}</p>
        </div>
      ) : null}

      {brief.topSignals.length > 0 ? (
        <div className="mt-5 space-y-3">
          {brief.topSignals.map((signal) => (
            <article key={signal.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.14em] text-slate-500">
                <span>{signal.signal_type}</span>
                <span>{impactLabel(signal.impact_direction)}</span>
                <span>{formatConfidence(signal.confidence)}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-950">{signal.title}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
