import type { TippingEvent } from '@/lib/portfolio-read-model';

type Props = {
  events: TippingEvent[];
};

const EVENT_COLOR: Record<string, string> = {
  CRITICAL: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  ALERT: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  CROSSOVER: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
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

function formatGap(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(3)} USD/L`;
}

function pathwayLabel(pathway: string): string {
  return pathway.toUpperCase();
}

export function TippingEventTimeline({ events }: Props) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tipping Events</p>
          <h3 className="mt-2 text-xl font-semibold text-white">SAF crossover timeline</h3>
        </div>
        <p className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{events.length} events</p>
      </div>

      {events.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-5 text-sm text-slate-300">
          No recent tipping events returned by <code>/v1/analysis/tipping-point/events</code>.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {events.map((event) => {
            const badgeClass = EVENT_COLOR[event.event_type] ?? 'border-slate-600 bg-slate-700/20 text-slate-200';
            return (
              <article key={event.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] ${badgeClass}`}>
                    {event.event_type}
                  </span>
                  <span className="text-sm font-medium text-white">{pathwayLabel(event.saf_pathway)}</span>
                  <span className="text-xs text-slate-400">{formatTime(event.observed_at)}</span>
                </div>

                <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                  <p>Fossil: {event.fossil_price_usd_per_l.toFixed(3)} USD/L</p>
                  <p>SAF effective: {event.saf_effective_cost_usd_per_l.toFixed(3)} USD/L</p>
                  <p>Gap: {formatGap(event.gap_usd_per_l)}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
