import type { TippingEvent } from '@/lib/portfolio-read-model';

type Props = {
  events: TippingEvent[];
};

const EVENT_COLOR: Record<string, string> = {
  CRITICAL: 'border-danger bg-danger-soft text-danger',
  ALERT: 'border-warning bg-warning-soft text-warning',
  CROSSOVER: 'border-accent bg-accent-soft text-accent'
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatGap(value: number): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(3)} USD/L`;
}

function pathwayLabel(pathway: string): string {
  return pathway.toUpperCase();
}

export function TippingEventTimeline({ events }: Props) {
  return (
    // Bare artifact: card, title and why-line come from the wrapping Panel.
    <div>
      <div className="flex justify-end">
        <p className="rounded-full border border-line bg-surface-muted px-3 py-1 text-xs text-muted">{events.length} 个事件</p>
      </div>

      {events.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-surface-muted p-5 text-sm text-muted">
          最近窗口内没有返回新的 SAF 成本交叉事件。若 API 未连接，这里会保持空状态，避免把情景基线误读成真实事件。
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {events.map((event) => {
            const badgeClass = EVENT_COLOR[event.event_type] ?? 'border-line-strong bg-surface text-ink';
            return (
              <article key={event.id} className="rounded-xl border border-line bg-surface-muted p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] ${badgeClass}`}>
                    {event.event_type}
                  </span>
                  <span className="text-sm font-medium text-ink">{pathwayLabel(event.saf_pathway)}</span>
                  <span className="text-xs text-muted">{formatTime(event.observed_at)}</span>
                </div>

                <div className="mt-3 grid gap-3 text-sm text-muted md:grid-cols-3">
                  <p>化石航油：{event.fossil_price_usd_per_l.toFixed(3)} USD/L</p>
                  <p>SAF 有效成本：{event.saf_effective_cost_usd_per_l.toFixed(3)} USD/L</p>
                  <p>价差：{formatGap(event.gap_usd_per_l)}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
