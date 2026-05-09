import type { TippingEvent } from '@/lib/portfolio-read-model';

type Props = {
  events: TippingEvent[];
};

const EVENT_COLOR: Record<string, string> = {
  CRITICAL: 'border-rose-200 bg-rose-50 text-rose-700',
  ALERT: 'border-amber-200 bg-amber-50 text-amber-800',
  CROSSOVER: 'border-emerald-200 bg-emerald-50 text-emerald-800'
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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">拐点事件</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">SAF 交叉时间线</h3>
        </div>
        <p className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">{events.length} 个事件</p>
      </div>

      {events.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-sky-200 bg-sky-50 p-5 text-sm text-sky-800">
          最近窗口内没有返回新的 SAF 成本交叉事件。若 API 未连接，这里会保持空状态，避免把情景基线误读成真实事件。
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {events.map((event) => {
            const badgeClass = EVENT_COLOR[event.event_type] ?? 'border-slate-200 bg-slate-50 text-slate-700';
            return (
              <article key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] ${badgeClass}`}>
                    {event.event_type}
                  </span>
                  <span className="text-sm font-medium text-slate-950">{pathwayLabel(event.saf_pathway)}</span>
                  <span className="text-xs text-slate-500">{formatTime(event.observed_at)}</span>
                </div>

                <div className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                  <p>化石航油：{event.fossil_price_usd_per_l.toFixed(3)} USD/L</p>
                  <p>SAF 有效成本：{event.saf_effective_cost_usd_per_l.toFixed(3)} USD/L</p>
                  <p>价差：{formatGap(event.gap_usd_per_l)}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
