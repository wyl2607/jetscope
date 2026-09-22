'use client';

import { FigureValue } from '@/components/figure-value';
import { getPathwayStatusLabel } from '@/lib/market-signals';
import { formatFigure, type Figure } from '@/lib/figure';
import type { DecisionReadModel, TippingPointReadModel } from '@/lib/product-read-model';

type Props = {
  tippingPoint: TippingPointReadModel | null;
  decision: DecisionReadModel | null;
  reserveWeeks: Figure;
};

function probabilityLabel(value: number): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
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
  // Display via formatFigure so null renders "—", never laundered to 0.
  const tippingRows = leadPathway
    ? [
        {
          key: 'net_saf_low',
          label: `${leadPathway.display_name} 低位`,
          display: formatFigure(leadPathway.netCostLow)
        },
        {
          key: 'net_saf_high',
          label: `${leadPathway.display_name} 高位`,
          display: formatFigure(leadPathway.netCostHigh)
        },
        {
          key: 'spread_band',
          label: '价差区间',
          display: `${formatFigure(leadPathway.spreadLow)} 至 ${formatFigure(leadPathway.spreadHigh)}`
        },
        {
          key: 'status',
          label: '状态',
          display: getPathwayStatusLabel(leadPathway.status ?? '')
        }
      ]
    : [];

  return (
    // Bare artifact: card, title and why-line come from the wrapping Panel.
    <div>
      <div className="mb-6 flex justify-end text-right">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">储备</p>
          <p className="text-sm font-semibold text-ink">
            <FigureValue figure={reserveWeeks} locale="zh" size="inline" showTimestamp={false} />
          </p>
        </div>
      </div>

      {tippingRows.length > 0 && (
        <div className="mb-6 overflow-x-auto">
          <h4 className="mb-2 text-sm font-medium text-ink uppercase tracking-wider">SAF 路径状态</h4>
          <table className="w-full text-sm text-ink">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="py-2 pr-4 text-left">指标</th>
                <th className="py-2 pr-4 text-right">数值</th>
              </tr>
            </thead>
            <tbody>
              {tippingRows.map((row) => (
                <tr key={row.key} className="border-b border-line">
                  <td className="py-2 pr-4">{row.label}</td>
                  <td className="py-2 pr-4 text-right font-mono">{row.display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-medium text-ink uppercase tracking-wider">航司响应概率</h4>
        <div className="grid grid-cols-2 gap-3">
          {rows.map((row) => (
            <div key={row.key} className="rounded-lg border border-line-strong bg-surface p-3">
              <p className="text-xs text-muted uppercase tracking-wider">{row.label}</p>
              <p className="mt-1 text-lg font-semibold text-ink">{probabilityLabel(row.value)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
