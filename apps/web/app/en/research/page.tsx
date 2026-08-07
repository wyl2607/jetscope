import { MetricCard } from '@/components/cards';
import { localeCopy, PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
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
    href: '/en/reports/tipping-point-analysis' as Route,
    description: 'Put research signals back into the reserve, fuel-price, and SAF switching context.'
  },
  {
    label: 'Review source evidence',
    href: '/en/sources?filter=review' as Route,
    description: 'Check market provenance, proxy assumptions, fallback rows, and volatility before citing research signals.'
  },
  {
    label: 'Open admin prerequisites',
    href: '/en/admin' as Route,
    description: 'Use the primary operations console to verify research configuration and protected refresh readiness.'
  }
];

type PipelineState = 'disabled' | 'waiting' | 'not_found' | 'error' | 'ready';

function getPipelineState(enabled: boolean, status: string, signalCount: number): PipelineState {
  if (!enabled) return 'disabled';
  if (status === 'error') return 'error';
  if (status === 'not_found') return 'not_found';
  if (signalCount === 0) return 'waiting';
  return 'ready';
}

function pipelineStateLabel(state: PipelineState): string {
  if (state === 'disabled') return 'Disabled';
  if (state === 'waiting') return 'Waiting for signals';
  if (state === 'not_found') return 'Not deployed';
  if (state === 'error') return 'Error';
  return 'Running';
}

function pipelineStateTone(state: PipelineState): string {
  if (state === 'disabled') return 'border-accent bg-accent-soft text-accent';
  if (state === 'waiting') return 'border-warning bg-warning-soft text-warning';
  if (state === 'not_found') return 'border-warning border-dashed bg-warning-soft text-warning';
  if (state === 'error') return 'border-danger bg-danger-soft text-danger';
  return 'border-success bg-success-soft text-success';
}

function pipelineValueTone(state: PipelineState): string {
  if (state === 'disabled') return 'text-accent';
  if (state === 'waiting' || state === 'not_found') return 'text-warning';
  if (state === 'error') return 'text-danger';
  return 'text-success';
}

function pipelineStateDetail(state: PipelineState, message: string | null): string {
  if (state === 'disabled') {
    return 'The research pipeline is disabled. This page does not claim that live AI analysis is running.';
  }
  if (state === 'waiting') {
    return 'The research API is enabled, but no persisted signal is available yet. The daily research job still needs to produce reviewable evidence.';
  }
  if (state === 'not_found') {
    return 'The research service is not deployed or cannot be found in this environment. An empty result is not a market finding.';
  }
  if (state === 'error') return `Research API error: ${message ?? 'unknown cause'}. Do not cite research findings until it recovers.`;
  return 'The research API is enabled; this page displays persisted signals from the current review window.';
}

function toneForImpact(impact: ResearchSignal['impact_direction']): string {
  if (impact === 'positive') return 'border-success bg-success-soft text-success';
  if (impact === 'negative') return 'border-danger bg-danger-soft text-danger';
  if (impact === 'neutral') return 'border-line bg-surface text-muted';
  return 'border-warning bg-warning-soft text-warning';
}

function impactLabel(impact: ResearchSignal['impact_direction']): string {
  if (impact === 'positive') return 'Positive';
  if (impact === 'negative') return 'Negative';
  if (impact === 'neutral') return 'Neutral';
  return 'Unknown';
}

function formatTime(value: string | null): string {
  if (value == null) return localeCopy('en').noData;
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
  const latestSignal = result.signals.reduce<typeof result.signals[number] | null>((latest, signal) => {
    if (!latest) return signal;
    const signalTime = signal.published_at == null ? Number.NEGATIVE_INFINITY : new Date(signal.published_at).getTime();
    const latestTime = latest.published_at == null ? Number.NEGATIVE_INFINITY : new Date(latest.published_at).getTime();
    return signalTime > latestTime ? signal : latest;
  }, null);
  const positiveCount = result.signals.filter((signal) => signal.impact_direction === 'positive').length;
  const negativeCount = result.signals.filter((signal) => signal.impact_direction === 'negative').length;
  const neutralCount = result.signals.filter((signal) => signal.impact_direction === 'neutral').length;
  const state = getPipelineState(AI_RESEARCH_ENABLED, result.status, result.signals.length);
  const resultMessage = result.status === 'error' ? result.message : null;
  const asOf = state === 'ready' ? latestSignal?.published_at ?? null : null;
  const latestSignalValue = latestSignal ? formatTime(latestSignal.published_at) : 'No signal';
  const latestSignalHint = latestSignal
    ? signalTitle(latestSignal, 0)
    : 'No persisted research signal is available for the current review window.';

  return (
    <PageTemplate
      locale="en"
      eyebrow="AI research pipeline"
      title="Research Workbench"
      question="Are today’s research signals strong enough to explain why the market is moving?"
      asOf={asOf}
    >
      <SignalRow label="Research conclusion signals">
        <MetricCard
          label="Pipeline status"
          value={pipelineStateLabel(state)}
          valueClassName={pipelineValueTone(state)}
          hint={pipelineStateDetail(state, resultMessage)}
        />
        <MetricCard
          label="Signal count"
          value={`${result.signals.length}`}
          hint={`Positive ${positiveCount} | Negative ${negativeCount} | Neutral ${neutralCount}`}
        />
        <MetricCard label="Latest signal" value={latestSignalValue} hint={latestSignalHint} />
        <MetricCard
          label="Usage boundary"
          value={AI_RESEARCH_ENABLED ? 'Evidence layer' : 'Boundary only'}
          hint="Research explains possible causes; it never replaces market, reserve, scenario, or source review."
        />
      </SignalRow>

      <Panel
        locale="en"
        title="Research pipeline status"
        why="Keep configuration boundaries, waiting, missing deployment, and failures distinct before citing a signal."
      >
        <div className={`rounded-xl border p-4 text-sm leading-7 ${pipelineStateTone(state)}`}>
          <p className="font-semibold">{pipelineStateLabel(state)}</p>
          <p className="mt-1">{pipelineStateDetail(state, resultMessage)}</p>
        </div>
      </Panel>

      <Panel
        locale="en"
        title="Decision brief"
        why="Research is explanatory evidence, not an autonomous recommendation for market or procurement decisions."
      >
        {state !== 'ready' ? (
          <div className={`rounded-xl border p-4 text-sm leading-7 ${pipelineStateTone(state)}`}>
            {pipelineStateDetail(state, resultMessage)}
          </div>
        ) : (
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <p className="rounded-xl border border-accent bg-accent-soft p-3">Active: <span className="tabular-nums">{result.signals.length}</span></p>
            <p className="rounded-xl border border-success bg-success-soft p-3">Positive: <span className="tabular-nums">{positiveCount}</span></p>
            <p className="rounded-xl border border-danger bg-danger-soft p-3">Negative: <span className="tabular-nums">{negativeCount}</span></p>
            <p className="rounded-xl border border-line bg-surface p-3">Neutral: <span className="tabular-nums">{neutralCount}</span></p>
          </div>
        )}
      </Panel>

      <Panel locale="en" title="Evidence actions" why="Every research signal must reconnect to the decision chain and a reviewable source.">
        <div className="space-y-3">
          {actionLinks.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-semibold text-ink">{action.label}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel locale="en" title="Signal list" why="The individual signals keep direction, source context, and confidence visible instead of hiding them in an aggregate.">
        {state !== 'ready' ? (
          <div className={`rounded-xl border p-4 text-sm leading-7 ${pipelineStateTone(state)}`}>
            {pipelineStateDetail(state, resultMessage)}
          </div>
        ) : (
          <div className="space-y-4">
            {result.signals.map((signal, index) => (
              <article key={signal.id} className="rounded-xl border border-line bg-surface-muted p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-xl border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneForImpact(signal.impact_direction)}`}>
                    {impactLabel(signal.impact_direction)}
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em] text-muted">{signal.signal_type}</span>
                  <span className="text-xs tabular-nums text-muted">{formatTime(signal.published_at)}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink">{signalTitle(signal, index)}</h3>
                <p className="mt-3 text-sm leading-7 text-muted">{signalSummary(signal)}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">
                  Confidence <span className="tabular-nums">{(signal.confidence * 100).toFixed(0)}%</span>
                </p>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <SourceFooter
        locale="en"
        sources={[
          {
            id: 'research-signals',
            label: state === 'error' ? 'Research signal API is currently unavailable' : 'Research signal read model (direction, confidence, and publication time)',
            asOf,
            basis: 'derived'
          },
          {
            id: 'research-pipeline-config',
            label: 'Research pipeline enablement and deployment status',
            basis: 'assumption'
          }
        ]}
        methodHref="/en/sources"
        methodLabel="Sources and methods"
        limitations={[
          'Research explains possible causes; it does not replace market, reserve, scenario, or source review.',
          'Disabled, waiting, not deployed, or error states have no valid data-as-of. The timestamp comes only from the latest signal.',
          'An empty result is not evidence that the market has not moved.'
        ]}
      />
    </PageTemplate>
  );
}
