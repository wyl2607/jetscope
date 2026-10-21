import { formatFigure, type Figure } from '@/lib/figure';
import type { AirlineDecisionResponse } from '@/lib/product-read-model';
import { getAirlineDecisionSignalLabel } from '@/lib/market-signals';

type Props = {
  decision: Pick<AirlineDecisionResponse, 'signal' | 'probabilities' | 'saf_premium_pct' | 'saf_premium_basis' | 'saf_reference_period' | 'saf_allowance_coverage_pct' | 'method' | 'fare_pass_through_pct' | 'labor_cost_impact_eur_m' | 'extra_fuel_cost_eur_m' | 'residual_fuel_cost_exposure'> | null;
  reserveWeeks: Figure;
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

function probabilityLabel(value: number): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  return `${Math.round(value * 100)}%`;
}

export function AirlineDecisionMatrix({ decision, reserveWeeks, pathwayKey }: Props) {
  if (!decision) {
    return (
      <section className="min-w-0 rounded-2xl border border-line bg-surface/90 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-ink">
              航司决策矩阵
            </h4>
            <p className="mt-2 text-sm text-muted">
              储备压力 {formatFigure(reserveWeeks)} · 已选路径 {pathwayKey.toUpperCase()}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted">决策模型暂不可用。</p>
      </section>
    );
  }

  const rows = Object.entries(decision.probabilities) as Array<
    [keyof NonNullable<Props['decision']>['probabilities'], number]
  >;

  return (
    <section className="min-w-0 rounded-2xl border border-line bg-surface/90 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-ink">
            航司决策矩阵
          </h4>
          <p className="mt-2 text-sm text-muted">
            储备压力 {formatFigure(reserveWeeks)} · 已选路径 {pathwayKey.toUpperCase()}
          </p>
          {decision.saf_premium_pct != null && decision.saf_premium_basis != null && (
            <p className="mt-2 text-sm text-muted">
              SAF 买方溢价 {decision.saf_premium_pct >= 0 ? '+' : ''}{decision.saf_premium_pct.toFixed(1)}%
              {'（'}
              {decision.saf_premium_basis === 'market_reference'
                ? `EASA ${decision.saf_reference_period ?? '—'} 市场参考价`
                : '生产成本估算'}
              {decision.saf_allowance_coverage_pct != null && decision.saf_allowance_coverage_pct > 0
                ? `，已计 EU ETS SAF 配额补贴 ${Math.round(decision.saf_allowance_coverage_pct)}%`
                : ''}
              {'）· 概率为启发式情景，不是观测'}
            </p>
          )}
        </div>
        <span className="rounded-full border border-accent bg-accent-soft px-3 py-1 text-xs uppercase tracking-[0.18em] text-accent">
          {getAirlineDecisionSignalLabel(decision.signal)}
        </span>
      </div>

      {(decision.fare_pass_through_pct != null ||
        decision.labor_cost_impact_eur_m != null ||
        decision.residual_fuel_cost_exposure != null) && (
        <div className="mb-4 rounded-xl border border-warning bg-warning-soft px-4 py-3 text-sm text-ink">
          <p className="text-xs font-semibold uppercase tracking-wider text-warning">LH residual context</p>
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
            <article key={String(key)} className="rounded-2xl border border-line bg-surface/90 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h5 className="text-sm font-medium text-ink">{copy.title}</h5>
                  <p className="mt-2 text-xs leading-6 text-muted">{copy.body}</p>
                </div>
                <span className="text-sm font-semibold text-ink">{probabilityLabel(value)}</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent"
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
