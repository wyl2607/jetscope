import type { AirlineDecisionResponse } from '@/lib/product-read-model';
import { getAirlineDecisionSignalLabel } from '@/lib/market-signals';

type Props = {
  decision: Pick<AirlineDecisionResponse, 'signal' | 'probabilities' | 'fare_pass_through_pct' | 'labor_cost_impact_eur_m' | 'extra_fuel_cost_eur_m' | 'residual_fuel_cost_exposure'> | null;
  reserveWeeks: number;
  pathwayKey: string;
};

const DECISION_COPY: Record<
  keyof NonNullable<Props['decision']>['probabilities'],
  { title: string; body: string }
> = {
  raise_fares: {
    title: 'µÅÉÚ½ÿþÑ¿õ╗À',
    body: 'Õ░åþçâµ▓╣õ©Äþó│µêÉµ£¼ÕÄïÕèøõ╝áÕ»╝Õê░þÑ¿õ╗ÀÒÇé'
  },
  cut_capacity: {
    title: 'ÕëèÕçÅÞ┐ÉÕèø',
    body: 'ÕçÅÕ░æþƒ¡ÚÇöµêûõ¢ÄÕê®µÂªÞê¬þÅ¡Úóæµ¼íõ╗Ñõ┐ØµèñÕê®µÂªþÄçÒÇé'
  },
  buy_spot_saf: {
    title: 'þÄ░Þ┤ºÚççÞ┤¡ SAF',
    body: 'ÕÉêÞºäÕÄïÕèøõ©èÕìçµùÂÕó×Õèáþƒ¡µ£ƒ SAF ÚççÞ┤¡ÒÇé'
  },
  sign_long_term_offtake: {
    title: 'þ¡¥þ¢▓Úò┐µ£ƒµë┐Þ┤¡',
    body: 'ÚççÞ┤¡õ╗Äµ£║õ╝ÜÕ×ïõ╣░ÕàÑÞ¢¼ÕÉæþ╗ôµ×äÕîûõ¥øþ╗ÖÕìÅÞ««ÒÇé'
  },
  ground_routes: {
    title: 'Õü£Úú×Þê¬þ║┐',
    body: 'Þê¬þ║┐þ╗ÅµÁÄµÇºÕñ▒µòêµùÂþÜäµ£ÇÚ½ÿÕÄïÕèøÞ¥╣þòîµâàÕ¢óÒÇé'
  }
};

function probabilityLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function AirlineDecisionMatrix({ decision, reserveWeeks, pathwayKey }: Props) {
  if (!decision) {
    return (
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white/90 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
              Þê¬ÕÅ©Õå│þ¡ûþƒ®ÚÿÁ
            </h4>
            <p className="mt-2 text-sm text-slate-500">
              Õé¿ÕñçÕÄïÕèø {reserveWeeks.toFixed(1)} Õæ¿ ┬À ÕÀ▓ÚÇëÞÀ»Õ¥ä {pathwayKey.toUpperCase()}
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-600">Õå│þ¡ûµ¿íÕ×ïµÜéõ©ìÕÅ»þö¿ÒÇé</p>
      </section>
    );
  }

  const rows = Object.entries(decision.probabilities) as Array<
    [keyof NonNullable<Props['decision']>['probabilities'], number]
  >;

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white/90 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
            Þê¬ÕÅ©Õå│þ¡ûþƒ®ÚÿÁ
          </h4>
          <p className="mt-2 text-sm text-slate-500">
            Õé¿ÕñçÕÄïÕèø {reserveWeeks.toFixed(1)} Õæ¿ ┬À ÕÀ▓ÚÇëÞÀ»Õ¥ä {pathwayKey.toUpperCase()}
          </p>
        </div>
        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs uppercase tracking-[0.18em] text-sky-800">
          {getAirlineDecisionSignalLabel(decision.signal)}
        </span>
      </div>

      {(decision.fare_pass_through_pct != null ||
        decision.labor_cost_impact_eur_m != null ||
        decision.residual_fuel_cost_exposure != null) && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">LH residual context</p>
          <p className="mt-1">
            Pass-through{' '}
            {decision.fare_pass_through_pct != null
              ? `${Math.round(decision.fare_pass_through_pct * 100)}%`
              : 'n/a'}
            {' · '}
            residual index{' '}
            {decision.residual_fuel_cost_exposure != null
              ? decision.residual_fuel_cost_exposure.toFixed(3)
              : 'n/a'}
            {' · '}
            labor €{decision.labor_cost_impact_eur_m ?? '—'}m
            {' · '}
            extra fuel €{decision.extra_fuel_cost_eur_m ?? '—'}m
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(([key, value]) => {
          const copy = DECISION_COPY[key];
          return (
            <article key={String(key)} className="rounded-2xl border border-slate-200 bg-white/90 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h5 className="text-sm font-medium text-slate-950">{copy.title}</h5>
                  <p className="mt-2 text-xs leading-6 text-slate-600">{copy.body}</p>
                </div>
                <span className="text-sm font-semibold text-slate-950">{probabilityLabel(value)}</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
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
