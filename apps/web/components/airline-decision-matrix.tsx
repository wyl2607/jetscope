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
    title: '提高票价',
    body: '将燃油与碳成本压力传导到票价。'
  },
  cut_capacity: {
    title: '削减运力',
    body: '减少短途或低利润航班频次以保护利润率。'
  },
  buy_spot_saf: {
    title: '现货采购 SAF',
    body: '合规压力上升时增加短期 SAF 采购。'
  },
  sign_long_term_offtake: {
    title: '签署长期承购',
    body: '采购从机会型买入转向结构化供给协议。'
  },
  ground_routes: {
    title: '停飞航线',
    body: '航线经济性失效时的最高压力边界情形。'
  }
};

function probabilityLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function AirlineDecisionMatrix({ decision, reserveWeeks, pathwayKey }: Props) {
  if (!decision) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
              航司决策矩阵
            </h4>
            <p className="mt-2 text-sm text-slate-500">
              储备压力 {reserveWeeks.toFixed(1)} 周 · 已选路径 {pathwayKey.toUpperCase()}
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-600">决策模型暂不可用。</p>
      </section>
    );
  }

  const rows = Object.entries(decision.probabilities) as Array<
    [keyof NonNullable<Props['decision']>['probabilities'], number]
  >;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
            航司决策矩阵
          </h4>
          <p className="mt-2 text-sm text-slate-500">
            储备压力 {reserveWeeks.toFixed(1)} 周 · 已选路径 {pathwayKey.toUpperCase()}
          </p>
        </div>
        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs uppercase tracking-[0.18em] text-sky-800">
          {getAirlineDecisionSignalLabel(decision.signal)}
        </span>
      </div>

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
