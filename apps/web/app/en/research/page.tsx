import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { AI_RESEARCH_ENABLED, getResearchSignals, type ResearchSignal } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Research Workbench',
  description:
    'English JetScope research workbench for AI research pipeline status, signal counts, confidence, and evidence handoffs.',
  path: '/en/research',
  alternateLanguages: {
    'zh-CN': '/research',
    en: '/en/research'
  }
});

const actionLinks: Array<{ label: string; href: Route; description: string }> = [
  {
    label: 'Open tipping-point report',
    href: '/reports/tipping-point-analysis' as Route,
    description: 'Put research signals back into the reserve, fuel-price, and SAF switching context.'
  },
  {
    label: 'Review source evidence',
    href: '/en/sources?filter=review' as Route,
    description: 'Check market provenance, proxy assumptions, fallback rows, and volatility before citing research signals.'
  },
  {
    label: 'Open admin prerequisites',
    href: '/admin' as Route,
    description: 'Use the primary operations console to verify research configuration and protected refresh readiness.'
  }
];

function toneForImpact(impact: ResearchSignal['impact_direction']): string {
  if (impact === 'positive') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (impact === 'negative') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (impact === 'neutral') return 'border-slate-200 bg-white text-slate-700';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function impactLabel(impact: ResearchSignal['impact_direction']): string {
  if (impact === 'positive') return 'Positive';
  if (impact === 'negative') return 'Negative';
  if (impact === 'neutral') return 'Neutral';
  return 'Unknown';
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

function hasCjkText(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function signalTitle(signal: ResearchSignal, index: number): string {
  if (!hasCjkText(signal.title)) return signal.title;
  return `${signal.signal_type} signal ${index + 1}`;
}

function signalSummary(signal: ResearchSignal): string {
  if (signal.summary_en && !hasCjkText(signal.summary_en)) return signal.summary_en;
  if (signal.summary_en) return 'English summary is not available for this signal yet.';
  return 'No English summary is available for this signal yet.';
}

export default async function EnglishResearchPage() {
  const result = await getResearchSignals();
  const latestSignal = result.signals[0] ?? null;
  const positiveCount = result.signals.filter((signal) => signal.impact_direction === 'positive').length;
  const negativeCount = result.signals.filter((signal) => signal.impact_direction === 'negative').length;
  const neutralCount = result.signals.filter((signal) => signal.impact_direction === 'neutral').length;
  const pipelineStatus = AI_RESEARCH_ENABLED
    ? result.status === 'error'
      ? 'Error'
      : result.signals.length
        ? 'Running'
        : 'Waiting'
    : 'Disabled';
  const pipelineHint = AI_RESEARCH_ENABLED
    ? 'The research API is enabled; this page displays persisted signals from the current review window.'
    : 'The research pipeline is disabled in this environment; the page stays reviewable without claiming live AI analysis.';
  const usageMode = AI_RESEARCH_ENABLED ? 'Evidence layer' : 'Boundary only';
  const latestSignalValue = latestSignal ? formatTime(latestSignal.published_at) : 'No signal';
  const latestSignalHint = latestSignal
    ? signalTitle(latestSignal, 0)
    : 'No persisted research signal is available for the current review window.';

  return (
    <Shell
      locale="en"
      eyebrow="AI research pipeline"
      title="Research Workbench"
      description="Turn article-level research into a reviewable decision explanation layer; when the pipeline is disabled, the page keeps the boundary visible."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pipeline status" value={pipelineStatus} hint={pipelineHint} />
        <MetricCard
          label="Signal count"
          value={`${result.signals.length}`}
          hint={`Positive ${positiveCount} | Negative ${negativeCount} | Neutral ${neutralCount}`}
        />
        <MetricCard label="Latest signal" value={latestSignalValue} hint={latestSignalHint} />
        <MetricCard
          label="Usage boundary"
          value={usageMode}
          hint="Research explains possible causes; it never replaces market, reserve, scenario, or source review."
        />
      </section>

      {!AI_RESEARCH_ENABLED ? (
        <section className="mt-8 rounded-2xl border border-dashed border-sky-300 bg-sky-50 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-800">Enable research pipeline</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
            Set <code>JETSCOPE_AI_RESEARCH_ENABLED=true</code> after the backend research job is deployed. Until then,
            JetScope keeps this page buildable and navigable, but it does not pretend Claude-backed research extraction is live.
          </p>
        </section>
      ) : null}

      {result.status === 'error' ? (
        <section className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          Research API error: {result.message}
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <InfoCard title="Decision brief" subtitle="Research is explanatory evidence, not an autonomous recommendation">
          {result.status === 'error' ? (
            <p className="text-sm leading-7 text-slate-700">
              The research layer is degraded. Keep market and reserve evidence visible, but do not use research signals to explain probability changes until the API recovers.
            </p>
          ) : result.signals.length === 0 ? (
            <p className="text-sm leading-7 text-slate-700">
              No active research signal is available. This is expected while the research pipeline is disabled or before the daily ingestion job persists new evidence.
            </p>
          ) : (
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <p className="rounded-xl border border-sky-200 bg-sky-50 p-3">Active: {result.signals.length}</p>
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">Positive: {positiveCount}</p>
              <p className="rounded-xl border border-rose-200 bg-rose-50 p-3">Negative: {negativeCount}</p>
              <p className="rounded-xl border border-slate-200 bg-white p-3">Neutral: {neutralCount}</p>
            </div>
          )}
        </InfoCard>

        <InfoCard title="Evidence actions" subtitle="Every research signal must reconnect to the decision chain">
          <div className="space-y-3">
            {actionLinks.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:bg-sky-50"
              >
                <p className="font-semibold text-slate-950">{action.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{action.description}</p>
              </Link>
            ))}
          </div>
        </InfoCard>
      </section>

      <section className="mt-8">
        <InfoCard title="Signal list" subtitle="Current read model result">
          {result.status !== 'error' && result.signals.length === 0 ? (
            <p className="text-sm leading-7 text-slate-700">
              No research signals have been persisted for this review window. Reports should continue to rely on market, reserve, scenario, and source evidence.
            </p>
          ) : result.status === 'error' ? (
            <p className="text-sm leading-7 text-slate-700">
              The signal list is hidden until the research API recovers, preventing incomplete evidence from entering report decisions.
            </p>
          ) : (
            <div className="space-y-4">
              {result.signals.map((signal, index) => (
                <article key={signal.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${toneForImpact(signal.impact_direction)}`}>
                      {impactLabel(signal.impact_direction)}
                    </span>
                    <span className="text-xs uppercase tracking-[0.14em] text-slate-500">{signal.signal_type}</span>
                    <span className="text-xs text-slate-500">{formatTime(signal.published_at)}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">{signalTitle(signal, index)}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{signalSummary(signal)}</p>
                  <p className="mt-4 text-xs uppercase tracking-[0.14em] text-slate-500">
                    Confidence {(signal.confidence * 100).toFixed(0)}%
                  </p>
                </article>
              ))}
            </div>
          )}
        </InfoCard>
      </section>
    </Shell>
  );
}
