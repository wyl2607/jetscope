import type { ResearchDecisionBrief } from '@/lib/research-signals-read-model';
import type { Route } from 'next';
import Link from 'next/link';

const RESEARCH_ROUTE = '/research' as Route;

type Props = {
  brief: ResearchDecisionBrief;
  compact?: boolean;
  showLink?: boolean;
};

function statusTone(status: ResearchDecisionBrief['status']): string {
  if (status === 'error') return 'border-danger bg-danger-soft text-danger';
  if (status === 'not_found') return 'border-warning bg-warning-soft text-warning';
  if (status === 'empty') return 'border-line bg-surface text-ink';
  return 'border-accent bg-accent-soft text-accent';
}

function formatConfidence(value: number): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  return `${Math.round(value * 100)}%`;
}

function impactLabel(value: ResearchDecisionBrief['topSignals'][number]['impact_direction']): string {
  if (value === 'positive') return '正向';
  if (value === 'negative') return '负向';
  if (value === 'neutral') return '中性';
  return '未知';
}

export function ResearchDecisionBriefCard({ brief, compact = false, showLink = true }: Props) {
  return (
    // The one artifact that keeps a container of its own: the tint IS the
    // research posture (error / not deployed / empty / live). Stripping it to
    // sit bare inside the Panel would erase the status, which is the whole
    // point of the block. Sized as an inner block, not a peer card.
    <section className={`rounded-xl border p-4 ${statusTone(brief.status)}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-ink">{brief.headline}</h3>
        </div>
        {showLink ? (
          <Link href={RESEARCH_ROUTE} className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent">
            打开信号
          </Link>
        ) : null}
      </div>

      <p className="mt-4 text-sm leading-7 text-ink">{brief.whyMatters}</p>
      <p className="mt-3 text-sm leading-7 text-muted">{brief.action}</p>

      {!compact ? (
        <div className="mt-5 grid gap-3 text-sm md:grid-cols-4">
          <p className="rounded-xl border border-line bg-surface-muted p-3">活跃：{brief.activeCount}</p>
          <p className="rounded-xl border border-success bg-success-soft p-3">利多：{brief.positiveCount}</p>
          <p className="rounded-xl border border-danger bg-danger-soft p-3">利空：{brief.negativeCount}</p>
          <p className="rounded-xl border border-line bg-surface p-3">中性：{brief.neutralCount}</p>
        </div>
      ) : null}

      {brief.topSignals.length > 0 ? (
        <div className="mt-5 space-y-3">
          {brief.topSignals.map((signal) => (
            <article key={signal.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted">
                <span>{signal.signal_type}</span>
                <span>{impactLabel(signal.impact_direction)}</span>
                <span>{formatConfidence(signal.confidence)}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-ink">{signal.title}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
