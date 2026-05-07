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
    { key: 'raise_fares', label: '提高票价', value: decision?.probabilities?.raise_fares ?? 0 },
    { key: 'cut_capacity', label: '削减运力', value: decision?.probabilities?.cut_capacity ?? 0 },
    { key: 'buy_spot_saf', label: '现货采购 SAF', value: decision?.probabilities?.buy_spot_saf ?? 0 },
    { key: 'sign_long_term_offtake', label: '签署长期承购', value: decision?.probabilities?.sign_long_term_offtake ?? 0 },
    { key: 'ground_routes', label: '停飞航线', value: decision?.probabilities?.ground_routes ?? 0 }
  ];

  const leadPathway = tippingPoint?.pathways?.[0] ?? null;
  const tippingRows = leadPathway ? [
    {
      key: 'net_saf_low',
      label: `${leadPathway.display_name} 低位`,
      value: leadPathway.net_cost_low_usd_per_l,
      format: (v: number) => `$${v.toFixed(2)}/L`
    },
    {
      key: 'net_saf_high',
      label: `${leadPathway.display_name} 高位`,
      value: leadPathway.net_cost_high_usd_per_l,
      format: (v: number) => `$${v.toFixed(2)}/L`
    },
    {
      key: 'spread_band',
      label: '价差区间',
      value: 0,
      format: () => `${leadPathway.spread_low_pct.toFixed(1)}% 至 ${leadPathway.spread_high_pct.toFixed(1)}%`
    },
    {
      key: 'status',
      label: '状态',
      value: 0,
      format: () => getPathwayStatusLabel(leadPathway.status ?? '')
    }
  ] : [];

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-white">拐点模拟器</h3>
          <p className="mt-1 text-sm text-slate-400">
            基于 API 的模型，综合燃油价格、碳价、储备压力和路径经济性。
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 uppercase tracking-wider">储备</p>
          <p className="text-sm font-semibold text-slate-200">{reserveWeeks.toFixed(1)}w</p>
        </div>
      </div>

      {tippingRows.length > 0 && (
        <div className="mb-6 overflow-x-auto">
          <h4 className="mb-2 text-sm font-medium text-slate-300 uppercase tracking-wider">SAF 路径状态</h4>
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="py-2 pr-4 text-left">指标</th>
                <th className="py-2 pr-4 text-right">数值</th>
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
        <h4 className="mb-2 text-sm font-medium text-slate-300 uppercase tracking-wider">航司响应概率</h4>
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
