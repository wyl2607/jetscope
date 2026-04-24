import type { ReserveCoverage } from '@/lib/portfolio-read-model';

type Props = {
  reserve: ReserveCoverage | null;
};

const STRESS_STYLE: Record<string, { label: string; badge: string; bar: string; text: string }> = {
  critical: {
    label: 'Critical',
    badge: 'border-rose-400/50 bg-rose-500/10 text-rose-200',
    bar: 'from-rose-600 via-rose-500 to-rose-400',
    text: 'text-rose-200'
  },
  elevated: {
    label: 'Elevated',
    badge: 'border-amber-400/50 bg-amber-500/10 text-amber-200',
    bar: 'from-amber-600 via-amber-500 to-amber-400',
    text: 'text-amber-200'
  },
  guarded: {
    label: 'Guarded',
    badge: 'border-yellow-400/50 bg-yellow-500/10 text-yellow-200',
    bar: 'from-yellow-600 via-yellow-500 to-yellow-400',
    text: 'text-yellow-200'
  },
  normal: {
    label: 'Normal',
    badge: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200',
    bar: 'from-emerald-600 via-emerald-500 to-emerald-400',
    text: 'text-emerald-200'
  }
};

function formatUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function coverageWidth(coverageWeeks: number): number {
  return Math.max(8, Math.min(100, (coverageWeeks / 8) * 100));
}

export function ReservesCoverageStrip({ reserve }: Props) {
  if (!reserve) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Reserve Signal</p>
        <h3 className="mt-2 text-xl font-semibold text-white">EU reserve feed unavailable</h3>
        <p className="mt-2 text-sm text-slate-300">
          Unable to load <code>/v1/reserves/eu</code>. Crisis view remains available with fallback visuals.
        </p>
      </section>
    );
  }

  const style = STRESS_STYLE[reserve.stress_level] ?? STRESS_STYLE.guarded;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Reserve Signal</p>
          <h3 className="mt-2 text-xl font-semibold text-white">EU jet reserve coverage</h3>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${style.badge}`}>
          {style.label}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Coverage</p>
          <p className={`mt-2 text-3xl font-semibold ${style.text}`}>{reserve.coverage_weeks.toFixed(2)}w</p>
          <p className="mt-1 text-xs text-slate-400">{reserve.coverage_days.toFixed(0)} days equivalent</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Supply gap pressure</p>
          <p className="mt-2 text-3xl font-semibold text-white">{reserve.estimated_supply_gap_pct.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-slate-400">Model-derived stress pressure</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Source type</p>
          <p className="mt-2 text-xl font-semibold text-white">{reserve.source_type}</p>
          <p className="mt-1 text-xs text-slate-400">{reserve.source_name}</p>
        </div>
      </div>

      <div className="mt-6">
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${style.bar}`}
            style={{ width: `${coverageWidth(reserve.coverage_weeks)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
          <span>0w</span>
          <span>2w critical</span>
          <span>4w elevated</span>
          <span>8w stable</span>
        </div>
        <p className="mt-3 text-xs text-slate-400">Updated {formatUpdatedAt(reserve.generated_at)} · confidence {(reserve.confidence_score * 100).toFixed(0)}%</p>
      </div>
    </section>
  );
}
