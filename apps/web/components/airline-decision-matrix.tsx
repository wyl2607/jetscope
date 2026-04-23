import type { AirlineDecisionResponse } from '@/lib/product-read-model';
import { getAirlineDecisionSignalLabel } from '@/lib/market-signals';

type Props = {
  decision: Pick<AirlineDecisionResponse, 'signal' | 'probabilities'> | null;
  reserveWeeks: number;
  pathwayKey: string;
};

const DECISION_COPY: Record<
  keyof NonNullable<Props['decision']>['probabilities'],
  { title: string; body: string }
> = {
  raise_fares: {
    title: 'Raise fares',
    body: 'Fuel and carbon pressure are passed through to ticket pricing.'
  },
  cut_capacity: {
    title: 'Cut capacity',
    body: 'Short-haul or low-margin frequencies are reduced to protect margin.'
  },
  buy_spot_saf: {
    title: 'Buy spot SAF',
    body: 'Short-term SAF procurement increases when compliance pressure rises.'
  },
  sign_long_term_offtake: {
    title: 'Sign long-term offtake',
    body: 'Procurement shifts from opportunistic buying to structured supply agreements.'
  },
  ground_routes: {
    title: 'Ground routes',
    body: 'The most stressed edge case where route economics stop working.'
  }
};

function probabilityLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function AirlineDecisionMatrix({ decision, reserveWeeks, pathwayKey }: Props) {
  if (!decision) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
              Airline decision matrix
            </h4>
            <p className="mt-2 text-sm text-slate-500">
              Reserve stress {reserveWeeks.toFixed(1)}w · selected pathway {pathwayKey.toUpperCase()}
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-400">Decision model unavailable.</p>
      </section>
    );
  }

  const rows = Object.entries(decision.probabilities) as Array<
    [keyof NonNullable<Props['decision']>['probabilities'], number]
  >;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
            Airline decision matrix
          </h4>
          <p className="mt-2 text-sm text-slate-500">
            Reserve stress {reserveWeeks.toFixed(1)}w · selected pathway {pathwayKey.toUpperCase()}
          </p>
        </div>
        <span className="rounded-full border border-sky-900/60 bg-sky-950/30 px-3 py-1 text-xs uppercase tracking-[0.18em] text-sky-200">
          {getAirlineDecisionSignalLabel(decision.signal)}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(([key, value]) => {
          const copy = DECISION_COPY[key];
          return (
            <article key={String(key)} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h5 className="text-sm font-medium text-white">{copy.title}</h5>
                  <p className="mt-2 text-xs leading-6 text-slate-400">{copy.body}</p>
                </div>
                <span className="text-sm font-semibold text-white">{probabilityLabel(value)}</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-300"
                  style={{ width: `${Math.max(4, value * 100)}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
