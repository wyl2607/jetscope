'use client';

import { useEffect, useRef, useState } from 'react';
import {
  type GridParityResponse,
  gridSignalLabel,
  gridStatusLabel,
  gridStatusTone,
  loadGridParity
} from '@/lib/grid-parity-read-model';

type Props = {
  initial: GridParityResponse;
};

export function GridParityWorkbench({ initial }: Props) {
  const [carbonPrice, setCarbonPrice] = useState<number>(
    Math.round(initial.inputs.carbon_price_eur_per_t)
  );
  const [data, setData] = useState<GridParityResponse>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (carbonPrice === Math.round(initial.inputs.carbon_price_eur_per_t) && data === initial) {
      return;
    }
    const id = ++requestId.current;
    setPending(true);
    const handle = setTimeout(() => {
      loadGridParity({ carbonPriceEurPerT: carbonPrice })
        .then((next) => {
          if (id === requestId.current) {
            setData(next);
            setError(null);
          }
        })
        .catch(() => {
          if (id === requestId.current) {
            setError('实时重算失败，展示上一次结果。');
          }
        })
        .finally(() => {
          if (id === requestId.current) setPending(false);
        });
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carbonPrice]);

  const fossil = data.fossil_reference;

  return (
    <div className="tabular-nums">
      <div className="mb-6 flex justify-end">
        <div
          className={`rounded-xl border px-3 py-1 text-sm font-semibold ${gridStatusTone(
            data.rows[0]?.status ?? 'inflection'
          )}`}
        >
          {gridSignalLabel(data.signal)}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-muted">
          <label htmlFor="carbon-price" className="font-medium uppercase tracking-wider">
            EU ETS 碳价
          </label>
          <span className="text-base font-semibold text-ink">
            €{carbonPrice}/t {pending && <span className="text-xs text-subtle">…</span>}
          </span>
        </div>
        <input
          id="carbon-price"
          type="range"
          min={0}
          max={150}
          step={1}
          value={carbonPrice}
          onChange={(event) => setCarbonPrice(Number(event.target.value))}
          className="mt-2 w-full accent-accent"
        />
        <div className="mt-1 flex justify-between text-xs text-subtle">
          <span>€0</span>
          <span>€150/t</span>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-line-strong bg-surface-muted p-3 text-sm text-muted">
        化石参照（{fossil.name}）边际成本：
        <span className="ml-1 font-semibold text-ink">
          €{fossil.marginal_cost_eur_per_mwh.toFixed(1)}/MWh
        </span>
        <span className="ml-1 text-xs text-muted">
          （燃料 €{fossil.fuel_cost_eur_per_mwh_th.toFixed(0)}/MWhₜₕ ÷ 效率 {fossil.efficiency} + 碳 €
          {(carbonPrice * fossil.emission_intensity_t_per_mwh).toFixed(1)}/MWh）
        </span>
      </div>

      {error && <p className="mb-3 rounded-xl border border-warning bg-warning-soft p-3 text-xs text-warning">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-muted">
          <thead>
            <tr className="border-b border-line-strong text-left">
              <th className="py-2 pr-4">可再生技术</th>
              <th className="py-2 pr-4 text-right">LCOE</th>
              <th className="py-2 pr-4 text-right">vs 化石</th>
              <th className="py-2 pr-4 text-right">价差</th>
              <th className="py-2 pr-4">状态</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.tech_key} className="border-b border-line">
                <td className="py-2 pr-4">{row.name}</td>
                <td className="py-2 pr-4 text-right">
                  €{row.lcoe_mid_eur_per_mwh.toFixed(0)}
                </td>
                <td className="py-2 pr-4 text-right">
                  {row.gap_vs_fossil_eur_per_mwh >= 0 ? '+' : ''}
                  €{row.gap_vs_fossil_eur_per_mwh.toFixed(1)}
                </td>
                <td className="py-2 pr-4 text-right">{row.spread_pct.toFixed(1)}%</td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded-xl border px-2 py-0.5 text-xs font-medium ${gridStatusTone(
                      row.status
                    )}`}
                  >
                    {gridStatusLabel(row.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
