'use client';

import { getPathwayStatusLabel } from '@/lib/market-signals';
import type { DecisionReadModel, TippingPointReadModel } from '@/lib/product-read-model';

type Props = {
  tippingPoint: TippingPointReadModel | null;
  decision: DecisionReadModel | null;
  reserveWeeks: number;
};

function probabilityLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function TippingPointSimulator({ tippingPoint, decision, reserveWeeks }: Props) {
  const rows = [
    { key: 'raise_fares', label: 'Raise fares', value: decision?.probabilities?.raise_fares ?? 0 },
    { key: 'cut_capacity', label: 'Cut capacity', value: decision?.probabilities?.cut_capacity ?? 0 },
    { key: 'buy_spot_saf', label: 'Buy spot SAF', value: decision?.probabilities?.buy_spot_saf ?? 0 },
    { key: 'sign_long_term_offtake', label: 'Sign long-term offtake', value: decision?.probabilities?.sign_long_term_offtake ?? 0 },
    { key: 'ground_routes', label: 'Ground routes', value: decision?.probabilities?.ground_routes ?? 0 }
  ];

  const leadPathway = tippingPoint?.pathways?.[0] ?? null;
  const tippingRows = leadPathway ? [
    {
      key: 'net_saf_low',
      label: `${leadPathway.display_name} low`,
      value: leadPathway.net_cost_low_usd_per_l,
      format: (v: number) => `$${v.toFixed(2)}/L`
    },
    {
      key: 'net_saf_high',
      label: `${leadPathway.display_name} high`,
      value: leadPathway.net_cost_high_usd_per_l,
      format: (v: number) => `$${v.toFixed(2)}/L`
    },
    {
      key: 'spread_band',
      label: 'Spread band',
      value: 0,
      format: () => `${leadPathway.spread_low_pct.toFixed(1)}% to ${leadPathway.spread_high_pct.toFixed(1)}%`
    },
    {
      key: 'status',
      label: 'Status',
      value: 0,
      format: () => getPathwayStatusLabel(leadPathway.status ?? '')
    }
  ] : [];

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-white">Tipping point simulator</h3>
          <p className="mt-1 text-sm text-slate-400">
            API-backed model using fuel price, carbon price, reserve stress, and pathway economics.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Reserve</p>
          <p className="text-sm font-semibold text-slate-200">{reserveWeeks.toFixed(1)}w</p>
        </div>
      </div>

      {tippingRows.length > 0 && (
        <div className="mb-6 overflow-x-auto">
          <h4 className="mb-2 text-sm font-medium text-slate-300 uppercase tracking-wider">SAF Pathway Status</h4>
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="py-2 pr-4 text-left">Metric</th>
                <th className="py-2 pr-4 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {tippingRows.map((row) => (
                <tr key={row.key} className="border-b border-slate-800">
                  <td className="py-2 pr-4">{row.label}</td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {row.format ? row.format(row.value) : row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-medium text-slate-300 uppercase tracking-wider">Airline Response Probabilities</h4>
        <div className="grid grid-cols-2 gap-3">
          {rows.map((row) => (
            <div key={row.key} className="rounded-lg border border-slate-700 bg-slate-950 p-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">{row.label}</p>
              <p className="mt-1 text-lg font-semibold text-white">{probabilityLabel(row.value)}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
