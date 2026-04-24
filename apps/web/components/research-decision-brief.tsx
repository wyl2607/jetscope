import type { ResearchDecisionBrief } from '@/lib/portfolio-read-model';
import Link from 'next/link';

type Props = {
  brief: ResearchDecisionBrief;
  compact?: boolean;
};

function statusTone(status: ResearchDecisionBrief['status']): string {
  if (status === 'error') return 'border-rose-600/40 bg-rose-500/10 text-rose-100';
  if (status === 'not_found') return 'border-amber-600/40 bg-amber-500/10 text-amber-100';
  if (status === 'empty') return 'border-slate-700 bg-slate-900/70 text-slate-200';
  return 'border-sky-600/40 bg-sky-500/10 text-sky-100';
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ResearchDecisionBriefCard({ brief, compact = false }: Props) {
  return (
    <section className={`rounded-2xl border p-6 ${statusTone(brief.status)}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] opacity-75">Research decision layer</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{brief.headline}</h3>
        </div>
        <Link href="/research" className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/90 transition hover:border-white/40">
          Open signals
        </Link>
      </div>

      <p className="mt-4 text-sm leading-7 text-slate-200">{brief.whyMatters}</p>
      <p className="mt-3 text-sm leading-7 text-slate-300">{brief.action}</p>

      {!compact ? (
        <div className="mt-5 grid gap-3 text-sm md:grid-cols-4">
          <p className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Active: {brief.activeCount}</p>
          <p className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Bullish: {brief.positiveCount}</p>
          <p className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Bearish: {brief.negativeCount}</p>
          <p className="rounded-xl border border-white/10 bg-slate-950/40 p-3">Neutral: {brief.neutralCount}</p>
        </div>
      ) : null}

      {brief.topSignals.length > 0 ? (
        <div className="mt-5 space-y-3">
          {brief.topSignals.map((signal) => (
            <article key={signal.id} className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.14em] text-slate-400">
                <span>{signal.signal_type}</span>
                <span>{signal.impact_direction}</span>
                <span>{formatConfidence(signal.confidence)}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">{signal.title}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
