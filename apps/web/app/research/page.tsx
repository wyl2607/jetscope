import { Shell } from '@/components/shell';
import { AI_RESEARCH_ENABLED, getResearchSignals } from '@/lib/portfolio-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Research Signals',
  description: 'AI-assisted SAF and jet fuel signal stream with confidence and source context.',
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

  return (
    <Shell
      eyebrow="AI Research Pipeline"
      title="Research Signals"
      description="News-derived ESG and market signals. The page is safe before Phase B is enabled and becomes data-backed once the research API is live."
    >
      {!AI_RESEARCH_ENABLED ? (
        <section className="rounded-2xl border border-dashed border-sky-600/50 bg-sky-500/10 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-200">Pipeline disabled</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200">
            Set <code>JETSCOPE_AI_RESEARCH_ENABLED=true</code> after the Phase B backend is deployed. Until then this
            route documents the product surface without claiming live Claude analysis.
          </p>
        </section>
      ) : null}

      {result.status === 'error' ? (
        <section className="mt-6 rounded-2xl border border-rose-600/40 bg-rose-500/10 p-6 text-sm text-rose-100">
          Research API error: {result.message}
        </section>
      ) : null}

      {result.signals.length === 0 ? (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h3 className="text-xl font-semibold text-white">No research signals yet</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            This is expected before the daily research job has persisted signals. The route remains build-safe and
            ready for the Phase B signal feed.
          </p>
        </section>
      ) : (
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
                Confidence {(signal.confidence * 100).toFixed(0)}%
              </p>
            </article>
          ))}
        </section>
      )}
    </Shell>
  );
}
